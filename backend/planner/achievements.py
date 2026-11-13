"""Achievement unlock rules.

Each check is cheap and idempotent: call it after the action that could
unlock something. Unlocking twice is a no-op (unique constraint + get_or_create).
The frontend learns about new unlocks from the "unseen" feed and shows a popup.
"""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from .models import Achievement, Activity, Assignment, Course, UserAchievement

# "In one sitting" means within this window.
SITTING = timedelta(minutes=30)

TASK_MILESTONES = [
    (10, 'baby-steps'),
    (50, 'trailblazer'),
    (100, 'ceo'),
    (1000, 'phoenix'),
]
MOST_CLASSES_OVER = 6          # more than 6 classes in one term
TASKS_ADDED_IN_SITTING = 20    # more, More, MORE
TASKS_DONE_IN_SITTING = 10     # Ultimate Task Taker
CLASSES_DELETED_IN_SITTING = 3  # Bye Bye Byee!~


def unlock(user, slug):
    """Unlock one achievement. Returns True only the first time."""
    achievement = Achievement.objects.filter(slug=slug).first()
    if achievement is None:
        return False
    _, created = UserAchievement.objects.get_or_create(user=user, achievement=achievement)
    return created


def _since_sitting_start():
    return timezone.now() - SITTING


def after_task_added(user):
    recent = Assignment.objects.filter(user=user, created_at__gte=_since_sitting_start()).count()
    if recent >= TASKS_ADDED_IN_SITTING:
        unlock(user, 'more-more-more')


def after_task_completed(user):
    done = Assignment.objects.filter(user=user, completed_at__isnull=False)
    total = done.count()
    for needed, slug in TASK_MILESTONES:
        if total >= needed:
            unlock(user, slug)
    # Counts tasks that are *currently* completed within the window, so
    # checking and unchecking one task repeatedly doesn't count.
    if done.filter(completed_at__gte=_since_sitting_start()).count() >= TASKS_DONE_IN_SITTING:
        unlock(user, 'ultimate-task-taker')


def after_course_added(user):
    busiest_term = (
        Course.objects.filter(user=user)
        .values('term')
        .annotate(n=Count('id'))
        .order_by('-n')
        .values_list('n', flat=True)
        .first()
    )
    if busiest_term and busiest_term > MOST_CLASSES_OVER:
        unlock(user, 'most-classes')


def after_course_deleted(user):
    Activity.objects.create(user=user, kind=Activity.Kind.COURSE_DELETED)
    recent = Activity.objects.filter(
        user=user, kind=Activity.Kind.COURSE_DELETED, created_at__gte=_since_sitting_start()
    ).count()
    if recent >= CLASSES_DELETED_IN_SITTING:
        unlock(user, 'bye-bye-byee')
