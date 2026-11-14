from datetime import timedelta, timezone as dt_timezone

from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from . import achievements, progress
from .models import (
    Achievement,
    Assignment,
    CalendarEvent,
    ClassMeeting,
    Course,
    Term,
    UserAchievement,
    XPEvent,
)
from .serializers import (
    AssignmentSerializer,
    CalendarEventSerializer,
    CourseSerializer,
    TermSerializer,
)

DASHBOARD_LIST_SIZE = 5
UPCOMING_EVENT_DAYS = 7
XP_HISTORY_SIZE = 15


def _datetime_param(params, name):
    """Optional ISO datetime query parameter, e.g. ?start=2026-11-01T00:00:00Z."""
    raw = params.get(name)
    if not raw:
        return None
    value = parse_datetime(raw)
    if value is None:
        raise serializers.ValidationError({name: 'Use an ISO date-time, e.g. 2026-11-01T00:00:00Z.'})
    if timezone.is_naive(value):
        value = value.replace(tzinfo=dt_timezone.utc)
    return value


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
    """Tasks. Filter with ?course=<id>, ?status=open|done, ?due_after= and ?due_before=."""

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
        if due_after := _datetime_param(params, 'due_after'):
            qs = qs.filter(due_at__gte=due_after)
        if due_before := _datetime_param(params, 'due_before'):
            qs = qs.filter(due_at__lt=due_before)
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


class CalendarEventViewSet(OwnedViewSet):
    """Calendar events. ?start= and ?end= return events overlapping that range."""

    serializer_class = CalendarEventSerializer

    def get_queryset(self):
        qs = CalendarEvent.objects.filter(user=self.request.user).select_related('course')
        params = self.request.query_params
        if start := _datetime_param(params, 'start'):
            qs = qs.filter(end_at__gte=start)
        if end := _datetime_param(params, 'end'):
            qs = qs.filter(start_at__lt=end)
        return qs

    def perform_create(self, serializer):
        super().perform_create(serializer)
        achievements.after_event_saved(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        achievements.after_event_saved(serializer.instance)

    def _toggle(self, change):
        event = self.get_object()
        xp_change = change(event)
        event.refresh_from_db()
        return Response({'event': self.get_serializer(event).data, 'xp_change': xp_change})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return self._toggle(progress.complete_event)

    @action(detail=True, methods=['post'])
    def uncomplete(self, request, pk=None):
        return self._toggle(progress.uncomplete_event)


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


@api_view(['GET'])
def achievement_list(request):
    """Every achievement with the user's status.

    Hidden ones the user hasn't unlocked yet come back without a name or
    description, so the API can't be used to spoil them.
    """
    unlocked = {
        u.achievement_id: u.unlocked_at
        for u in UserAchievement.objects.filter(user=request.user)
    }
    counts = achievements.progress_toward(request.user)
    rows = []
    for a in Achievement.objects.order_by('hidden', 'id'):
        unlocked_at = unlocked.get(a.id)
        secret = a.hidden and unlocked_at is None
        current, target = counts.get(a.slug, (None, None))
        rows.append({
            'slug': None if secret else a.slug,
            'name': '???' if secret else a.name,
            'description': 'Hidden achievement. Keep exploring!' if secret else a.description,
            'hidden': a.hidden,
            'unlocked': unlocked_at is not None,
            'unlocked_at': unlocked_at,
            'progress': None if unlocked_at or current is None else {
                'current': min(current, target), 'target': target,
            },
        })
    return Response(rows)


def _xp_label(row):
    """What an XP ledger row was for, for the history list."""
    thing = row.assignment or row.event
    if row.source == XPEvent.Source.POMODORO:
        return 'Focus session'
    name = thing.title if thing else 'a deleted item'
    return f'Undid "{name}"' if row.source == XPEvent.Source.UNDO else f'Finished "{name}"'


@api_view(['GET'])
def progress_summary(request):
    """Stats and recent XP for the progress page."""
    user = request.user
    ledger = XPEvent.objects.filter(user=user)
    recent = ledger.select_related('assignment', 'event').order_by('-created_at', '-id')[:XP_HISTORY_SIZE]
    return Response({
        'tasks_completed': Assignment.objects.filter(user=user, completed_at__isnull=False).count(),
        'events_completed': CalendarEvent.objects.filter(user=user, completed_at__isnull=False).count(),
        'xp_earned': ledger.filter(amount__gt=0).aggregate(total=Sum('amount'))['total'] or 0,
        'xp_values': {**progress.XP_BY_KIND, 'event': progress.XP_PER_EVENT},
        'recent_xp': [
            {'id': r.id, 'amount': r.amount, 'label': _xp_label(r), 'created_at': r.created_at}
            for r in recent
        ],
    })


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
