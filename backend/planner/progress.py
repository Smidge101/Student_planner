"""XP and levels.

XP is a ledger (XPEvent rows); the total is always summed, never stored, so
undoing a completion is just a negative row and nothing can drift.
"""

import math

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import Assignment, CalendarEvent, XPEvent

XP_BY_KIND = {
    Assignment.Kind.HOMEWORK: 5,
    Assignment.Kind.QUIZ: 10,
    Assignment.Kind.EXAM: 15,
}
XP_PER_EVENT = 20

# Level n (n >= 1) needs LEVEL_STEP * (n - 1)^2 XP, and any XP at all is level 1.
# So: level 1 at 1 XP, level 2 at 25, level 3 at 100, level 4 at 225, ...
LEVEL_STEP = 25


def total_xp(user):
    return user.xp_events.aggregate(total=Sum('amount'))['total'] or 0


def level_for_xp(xp):
    if xp <= 0:
        return 0
    return math.isqrt(xp // LEVEL_STEP) + 1


def xp_for_level(level):
    """Minimum XP needed to reach `level`."""
    if level <= 0:
        return 0
    if level == 1:
        return 1
    return LEVEL_STEP * (level - 1) ** 2


@transaction.atomic
def complete_assignment(assignment):
    """Mark done and award XP once. Returns the XP awarded (0 if already done)."""
    assignment = Assignment.objects.select_for_update().get(pk=assignment.pk)
    if assignment.completed_at is not None:
        return 0
    assignment.completed_at = timezone.now()
    assignment.save(update_fields=['completed_at'])
    amount = XP_BY_KIND[assignment.kind]
    XPEvent.objects.create(
        user=assignment.user,
        amount=amount,
        source=XPEvent.Source.ASSIGNMENT,
        assignment=assignment,
    )
    return amount


@transaction.atomic
def uncomplete_assignment(assignment):
    """Undo a completion and take back the XP it gave, so checking and
    unchecking a task can't farm XP."""
    assignment = Assignment.objects.select_for_update().get(pk=assignment.pk)
    if assignment.completed_at is None:
        return 0
    assignment.completed_at = None
    assignment.save(update_fields=['completed_at'])
    amount = XP_BY_KIND[assignment.kind]
    XPEvent.objects.create(
        user=assignment.user,
        amount=-amount,
        source=XPEvent.Source.UNDO,
        assignment=assignment,
    )
    return -amount


@transaction.atomic
def complete_event(event):
    event = CalendarEvent.objects.select_for_update().get(pk=event.pk)
    if event.completed_at is not None:
        return 0
    event.completed_at = timezone.now()
    event.save(update_fields=['completed_at'])
    XPEvent.objects.create(
        user=event.user,
        amount=XP_PER_EVENT,
        source=XPEvent.Source.EVENT,
        event=event,
    )
    return XP_PER_EVENT


@transaction.atomic
def uncomplete_event(event):
    event = CalendarEvent.objects.select_for_update().get(pk=event.pk)
    if event.completed_at is None:
        return 0
    event.completed_at = None
    event.save(update_fields=['completed_at'])
    XPEvent.objects.create(
        user=event.user,
        amount=-XP_PER_EVENT,
        source=XPEvent.Source.UNDO,
        event=event,
    )
    return -XP_PER_EVENT
