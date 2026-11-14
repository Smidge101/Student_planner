from django.db import transaction
from rest_framework import serializers

from . import progress
from .models import Assignment, CalendarEvent, ClassMeeting, Course, PomodoroSession, Term


class OwnedPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    """A link to another row that must belong to the same user.

    Someone else's id is rejected exactly like an id that doesn't exist.
    """

    def get_queryset(self):
        return super().get_queryset().filter(user=self.context['request'].user)


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


class MeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassMeeting
        fields = ['weekday', 'start_time', 'end_time', 'location']

    def validate(self, data):
        if data['end_time'] <= data['start_time']:
            raise serializers.ValidationError({'end_time': 'A class must end after it starts.'})
        return data


class CourseSerializer(serializers.ModelSerializer):
    """A class with its weekly meeting times, saved together.

    Sending `meetings` replaces all of the class's meeting times.
    """

    term = OwnedPrimaryKeyField(queryset=Term.objects.all(), allow_null=True, required=False)
    meetings = MeetingSerializer(many=True, required=False)
    open_tasks = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Course
        fields = ['id', 'name', 'color', 'term', 'meetings', 'open_tasks', 'created_at']
        read_only_fields = ['created_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the class a name.')
        return value

    def validate(self, data):
        # Each class in a term gets its own color. The database enforces this
        # too, but only here can we give a friendly message (and the database
        # can't compare classes that have no term).
        user = self.context['request'].user
        color = data.get('color', getattr(self.instance, 'color', None))
        term = data['term'] if 'term' in data else getattr(self.instance, 'term', None)
        clash = Course.objects.filter(user=user, term=term, color=color)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {'color': f'"{clash.first().name}" already uses this color. Pick another.'}
            )
        return data

    @transaction.atomic
    def create(self, data):
        meetings = data.pop('meetings', [])
        course = Course.objects.create(**data)
        ClassMeeting.objects.bulk_create(ClassMeeting(course=course, **m) for m in meetings)
        return course

    @transaction.atomic
    def update(self, course, data):
        meetings = data.pop('meetings', None)
        course = super().update(course, data)
        if meetings is not None:
            course.meetings.all().delete()
            ClassMeeting.objects.bulk_create(ClassMeeting(course=course, **m) for m in meetings)
        return course


class AssignmentSerializer(serializers.ModelSerializer):
    course = OwnedPrimaryKeyField(queryset=Course.objects.all(), allow_null=True, required=False)
    xp = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            'id', 'course', 'title', 'description', 'kind', 'due_at',
            'completed_at', 'xp', 'created_at',
        ]
        read_only_fields = ['completed_at', 'created_at']

    def get_xp(self, obj):
        return progress.XP_BY_KIND[obj.kind]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the task a title.')
        return value

    def validate_kind(self, value):
        # Undoing a completion takes back XP based on the kind, so the kind
        # can't change while the task is completed.
        if self.instance and self.instance.completed_at and value != self.instance.kind:
            raise serializers.ValidationError('Un-complete the task before changing its type.')
        return value


class CalendarEventSerializer(serializers.ModelSerializer):
    course = OwnedPrimaryKeyField(queryset=Course.objects.all(), allow_null=True, required=False)
    xp = serializers.SerializerMethodField()

    class Meta:
        model = CalendarEvent
        fields = [
            'id', 'course', 'title', 'description', 'location', 'start_at', 'end_at',
            'completed_at', 'xp', 'created_at',
        ]
        read_only_fields = ['completed_at', 'created_at']

    def get_xp(self, obj):
        return progress.XP_PER_EVENT

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the event a title.')
        return value

    def validate(self, data):
        start = data.get('start_at', getattr(self.instance, 'start_at', None))
        end = data.get('end_at', getattr(self.instance, 'end_at', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_at': 'An event must end after it starts.'})
        return data


# 1 to 12 sets and at most 6 hours of work ("1-6 hour study sessions").
POMODORO_MAX_WORK_MINUTES = 6 * 60


class PomodoroSessionSerializer(serializers.ModelSerializer):
    work_minutes = serializers.IntegerField(min_value=1, max_value=120)
    break_minutes = serializers.IntegerField(min_value=1, max_value=60)
    planned_sets = serializers.IntegerField(min_value=1, max_value=12)
    block_xp = serializers.SerializerMethodField()
    bonus_xp = serializers.SerializerMethodField()

    class Meta:
        model = PomodoroSession
        fields = [
            'id', 'work_minutes', 'break_minutes', 'planned_sets', 'completed_sets',
            'started_at', 'ended_at', 'stopped_early', 'block_xp', 'bonus_xp',
        ]
        read_only_fields = ['completed_sets', 'started_at', 'ended_at', 'stopped_early']

    def get_block_xp(self, obj):
        return progress.pomodoro_block_xp(obj.work_minutes)

    def get_bonus_xp(self, obj):
        return progress.pomodoro_bonus_xp(obj)

    def validate(self, data):
        total = data['work_minutes'] * data['planned_sets']
        if total > POMODORO_MAX_WORK_MINUTES:
            hours, minutes = divmod(total, 60)
            raise serializers.ValidationError({
                'planned_sets': f'That is {hours}h {minutes}m of work. Keep a session to 6 hours or less.'
            })
        return data
