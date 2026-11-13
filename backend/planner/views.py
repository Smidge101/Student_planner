from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import progress
from .models import Assignment, CalendarEvent, Term, UserAchievement

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


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = ['id', 'name', 'start_date', 'end_date']

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'A term must end after it starts.'})
        return data


class TermViewSet(OwnedViewSet):
    queryset = Term.objects.all()
    serializer_class = TermSerializer


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
