from datetime import timedelta

from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from . import achievements, progress
from .models import Assignment, CalendarEvent, ClassMeeting, Course, Term, UserAchievement
from .serializers import AssignmentSerializer, CourseSerializer, TermSerializer

DASHBOARD_LIST_SIZE = 5
UPCOMING_EVENT_DAYS = 7


class OwnedViewSet(viewsets.ModelViewSet):
    """Base for every student-data endpoint.

    Every query is limited to the logged-in user's rows, and new rows are
    always saved with that user. Another user's id gives a 404, not a 403, so
    the API doesn't even reveal that the row exists.
    """

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TermViewSet(OwnedViewSet):
    queryset = Term.objects.all()
    serializer_class = TermSerializer


class CourseViewSet(OwnedViewSet):
    serializer_class = CourseSerializer

    def get_queryset(self):
        return (
            Course.objects.filter(user=self.request.user)
            .prefetch_related(Prefetch('meetings', queryset=ClassMeeting.objects.order_by('weekday', 'start_time')))
            .annotate(open_tasks=Count('assignments', filter=Q(assignments__completed_at__isnull=True)))
        )

    def perform_create(self, serializer):
        super().perform_create(serializer)
        achievements.after_course_added(self.request.user)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        achievements.after_course_added(self.request.user)  # moving terms can also count

    def perform_destroy(self, course):
        # Deletes the class's assignments and events too (CASCADE).
        # XP already earned stays: XPEvent links are SET_NULL.
        super().perform_destroy(course)
        achievements.after_course_deleted(self.request.user)


class AssignmentViewSet(OwnedViewSet):
    """Tasks. Filter with ?course=<id> and ?status=open|done."""

    serializer_class = AssignmentSerializer

    def get_queryset(self):
        qs = Assignment.objects.filter(user=self.request.user).select_related('course')
        params = self.request.query_params
        if params.get('course', '').isdigit():
            qs = qs.filter(course_id=params['course'])
        if params.get('status') == 'open':
            qs = qs.filter(completed_at__isnull=True)
        elif params.get('status') == 'done':
            qs = qs.filter(completed_at__isnull=False).order_by('-completed_at')
        return qs

    def perform_create(self, serializer):
        super().perform_create(serializer)
        achievements.after_task_added(self.request.user)

    def _toggle(self, change):
        assignment = self.get_object()
        xp_change = change(assignment)
        if xp_change > 0:
            achievements.after_task_completed(self.request.user)
        assignment.refresh_from_db()
        data = self.get_serializer(assignment).data
        return Response({'assignment': data, 'xp_change': xp_change})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return self._toggle(progress.complete_assignment)

    @action(detail=True, methods=['post'])
    def uncomplete(self, request, pk=None):
        return self._toggle(progress.uncomplete_assignment)


@api_view(['GET'])
def unseen_achievements(request):
    """Unlocks the app hasn't shown a popup for yet."""
    rows = (
        UserAchievement.objects.filter(user=request.user, seen=False)
        .select_related('achievement')
        .order_by('unlocked_at')
    )
    return Response([
        {'slug': u.achievement.slug, 'name': u.achievement.name, 'description': u.achievement.description}
        for u in rows
    ])


@api_view(['POST'])
def mark_achievements_seen(request):
    slugs = request.data.get('slugs')
    if not isinstance(slugs, list):
        return Response({'slugs': 'Send a list of achievement slugs.'}, status=status.HTTP_400_BAD_REQUEST)
    UserAchievement.objects.filter(user=request.user, achievement__slug__in=slugs).update(seen=True)
    return Response(status=status.HTTP_204_NO_CONTENT)


def _course(obj):
    if obj.course is None:
        return None
    return {'id': obj.course.id, 'name': obj.course.name, 'color': obj.course.color}


@api_view(['GET'])
def dashboard(request):
    """Everything the dashboard shows below the header, in one request.

    Tasks: the next few unfinished ones, overdue first (they still need doing).
    Events: anything starting in the next week.
    """
    user = request.user
    now = timezone.now()

    tasks = (
        Assignment.objects.filter(user=user, completed_at__isnull=True)
        .select_related('course')
        .order_by('due_at')[:DASHBOARD_LIST_SIZE]
    )
    events = (
        CalendarEvent.objects.filter(
            user=user, end_at__gte=now, start_at__lte=now + timedelta(days=UPCOMING_EVENT_DAYS)
        )
        .select_related('course')
        .order_by('start_at')[:DASHBOARD_LIST_SIZE]
    )
    unlocked = (
        UserAchievement.objects.filter(user=user)
        .select_related('achievement')
        .order_by('unlocked_at')
    )

    return Response({
        'upcoming_tasks': [
            {
                'id': t.id,
                'title': t.title,
                'kind': t.kind,
                'due_at': t.due_at,
                'overdue': t.due_at < now,
                'xp': progress.XP_BY_KIND[t.kind],
                'course': _course(t),
            }
            for t in tasks
        ],
        'upcoming_events': [
            {
                'id': e.id,
                'title': e.title,
                'location': e.location,
                'start_at': e.start_at,
                'end_at': e.end_at,
                'course': _course(e),
            }
            for e in events
        ],
        'achievements': [
            {
                'slug': u.achievement.slug,
                'name': u.achievement.name,
                'description': u.achievement.description,
                'unlocked_at': u.unlocked_at,
            }
            for u in unlocked
        ],
        'has_courses': user.courses.exists(),
    })
