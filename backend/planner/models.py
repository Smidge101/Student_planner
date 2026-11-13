"""Planner data: terms, courses, work, events, XP and achievements.

Every row a student creates has a `user` foreign key (directly or through its
course). API views must always filter by `request.user`; nothing here is shown
in the Django admin, so the site owner can't browse students' work.
"""

from zoneinfo import available_timezones

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


# Keys only; the frontend maps each one to its hex value.
PASTEL_COLORS = [
    ('pink', 'Pink'),
    ('peach', 'Peach'),
    ('butter', 'Butter'),
    ('mint', 'Mint'),
    ('sky', 'Sky'),
    ('periwinkle', 'Periwinkle'),
    ('lavender', 'Lavender'),
    ('lilac', 'Lilac'),
]


def validate_timezone(value):
    if value not in available_timezones():
        raise ValidationError(f'{value} is not a valid time zone.')


class Profile(models.Model):
    """Display preferences and notification settings, one per user."""

    class ThemeMode(models.TextChoices):
        LIGHT = 'light', 'Light'
        DARK = 'dark', 'Dark'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile'
    )
    display_name = models.CharField(max_length=50, blank=True)
    timezone = models.CharField(
        max_length=64, default='UTC', validators=[validate_timezone]
    )
    theme_mode = models.CharField(
        max_length=5, choices=ThemeMode.choices, default=ThemeMode.LIGHT
    )
    accent_color = models.CharField(
        max_length=20, choices=PASTEL_COLORS, default='lavender'
    )
    email_reminders = models.BooleanField(default=True)
    reminder_hours_before = models.PositiveSmallIntegerField(default=24)

    def __str__(self):
        return f'Profile of {self.user}'


class Term(models.Model):
    """A semester or quarter. Weekly class meetings repeat inside it."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='terms'
    )
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()

    class Meta:
        ordering = ['-start_date']
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F('start_date')),
                name='term_ends_after_start',
            ),
        ]

    def __str__(self):
        return self.name


class Course(models.Model):
    """A class the student takes. Named Course because `class` is a Python keyword."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='courses'
    )
    term = models.ForeignKey(
        Term, on_delete=models.CASCADE, related_name='courses', null=True, blank=True
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=20, choices=PASTEL_COLORS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        constraints = [
            # Each class in a term gets its own color.
            models.UniqueConstraint(
                fields=['user', 'term', 'color'], name='unique_course_color_per_term'
            ),
        ]

    def __str__(self):
        return self.name


class ClassMeeting(models.Model):
    """One weekly time slot for a course, e.g. Monday 10:00-11:15."""

    class Weekday(models.IntegerChoices):
        MONDAY = 0
        TUESDAY = 1
        WEDNESDAY = 2
        THURSDAY = 3
        FRIDAY = 4
        SATURDAY = 5
        SUNDAY = 6

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='meetings')
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    location = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['weekday', 'start_time']
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F('start_time')),
                name='meeting_ends_after_start',
            ),
        ]

    def __str__(self):
        return f'{self.course} {self.get_weekday_display()} {self.start_time}'


class Assignment(models.Model):
    """A task: homework, quiz or exam. Deleting its course deletes it too."""

    class Kind(models.TextChoices):
        HOMEWORK = 'homework', 'Homework'
        QUIZ = 'quiz', 'Quiz'
        EXAM = 'exam', 'Exam'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='assignments'
    )
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name='assignments', null=True, blank=True
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.HOMEWORK)
    due_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_at']
        indexes = [models.Index(fields=['user', 'due_at'])]

    @property
    def is_completed(self):
        return self.completed_at is not None

    def __str__(self):
        return self.title


class CalendarEvent(models.Model):
    """Something the student adds to their calendar: study time, a club meeting..."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='events'
    )
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name='events', null=True, blank=True
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=100, blank=True)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_at']
        indexes = [models.Index(fields=['user', 'start_at'])]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_at__gte=F('start_at')),
                name='event_ends_after_start',
            ),
        ]

    def __str__(self):
        return self.title


class PomodoroSession(models.Model):
    """One run of the study timer: N sets of work + break."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pomodoro_sessions'
    )
    work_minutes = models.PositiveSmallIntegerField()
    break_minutes = models.PositiveSmallIntegerField()
    planned_sets = models.PositiveSmallIntegerField()
    completed_sets = models.PositiveSmallIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    stopped_early = models.BooleanField(default=False)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.CheckConstraint(
                condition=Q(work_minutes__gte=1) & Q(planned_sets__gte=1),
                name='pomodoro_has_work',
            ),
            models.CheckConstraint(
                condition=Q(completed_sets__lte=F('planned_sets')),
                name='pomodoro_sets_within_plan',
            ),
        ]


class XPEvent(models.Model):
    """One XP award. A user's XP is the sum of their rows, never a stored total.

    Links use SET_NULL so XP stays when a course and its work are deleted, as
    the plan asks. Undoing a completion adds a negative row.
    """

    class Source(models.TextChoices):
        ASSIGNMENT = 'assignment', 'Assignment'
        EVENT = 'event', 'Calendar event'
        POMODORO = 'pomodoro', 'Pomodoro'
        UNDO = 'undo', 'Undo'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='xp_events'
    )
    amount = models.IntegerField()
    source = models.CharField(max_length=12, choices=Source.choices)
    assignment = models.ForeignKey(
        Assignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    event = models.ForeignKey(
        CalendarEvent, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    pomodoro = models.ForeignKey(
        PomodoroSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'created_at'])]


class Achievement(models.Model):
    """The catalog of badges. Unlock rules live in code, keyed by slug."""

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=50)
    description = models.CharField(max_length=200)
    hidden = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class UserAchievement(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='achievements'
    )
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE)
    unlocked_at = models.DateTimeField(auto_now_add=True)
    # False until the app has shown the "achievement unlocked" popup.
    seen = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'achievement'], name='unlock_achievement_once'
            ),
        ]


class Activity(models.Model):
    """Things that leave no other trace but count toward hidden achievements,
    e.g. deleting a class (the class row itself is gone afterwards)."""

    class Kind(models.TextChoices):
        COURSE_DELETED = 'course_deleted', 'Deleted a class'
        POMODORO_STOPPED = 'pomodoro_stopped', 'Stopped the Pomodoro timer'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='activities'
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'kind', 'created_at'])]
