"""XP and levels.

XP is a ledger (XPEvent rows); the total is always summed, never stored, so
undoing a completion is just a negative row and nothing can drift.
"""

import math

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import Assignment, CalendarEvent, PomodoroSession, XPEvent

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


# ---------- Pomodoro ----------
# Longer focus earns more: 1 XP per 5 minutes of each finished work block,
# and finishing every planned set adds 1 XP per 10 minutes of total work.
POMODORO_XP_PER_MINUTES = 5
POMODORO_BONUS_PER_MINUTES = 10
# Browsers can fire a timer slightly early; allow this much slack.
POMODORO_CLOCK_SLACK_SECONDS = 10


def pomodoro_block_xp(work_minutes):
    return max(1, work_minutes // POMODORO_XP_PER_MINUTES)


def pomodoro_bonus_xp(session):
    return (session.work_minutes * session.planned_sets) // POMODORO_BONUS_PER_MINUTES


class PomodoroTooEarly(Exception):
    """A set was reported finished before its work time could have passed."""


@transaction.atomic
def complete_pomodoro_set(session):
    """Count one finished work block and award its XP (plus the bonus after
    the last one). Returns (xp_awarded, session_finished).

    The server checks that enough real time has passed since the session
    started for this many work blocks. Pauses only add time, so they never
    trip this check, but skipping ahead does.
    """
    session = PomodoroSession.objects.select_for_update().get(pk=session.pk)
    if session.ended_at is not None or session.completed_sets >= session.planned_sets:
        return 0, True

    needed = (session.completed_sets + 1) * session.work_minutes * 60 - POMODORO_CLOCK_SLACK_SECONDS
    if (timezone.now() - session.started_at).total_seconds() < needed:
        raise PomodoroTooEarly()

    session.completed_sets += 1
    amount = pomodoro_block_xp(session.work_minutes)
    finished = session.completed_sets == session.planned_sets
    if finished:
        amount += pomodoro_bonus_xp(session)
        session.ended_at = timezone.now()
    session.save(update_fields=['completed_sets', 'ended_at'])
    XPEvent.objects.create(
        user=session.user, amount=amount, source=XPEvent.Source.POMODORO, pomodoro=session,
    )
    return amount, finished
