from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from planner import progress

User = get_user_model()


class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    username = serializers.RegexField(
        r'^[A-Za-z0-9_.-]{3,30}$',
        error_messages={
            'invalid': 'Use 3-30 letters, numbers, dots, dashes or underscores.'
        },
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    email_reminders = serializers.BooleanField(default=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is taken.')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        # Run Django's password rules (length, common passwords, too similar to
        # the username/email, all numbers) against an unsaved user.
        candidate = User(username=data['username'], email=data['email'], full_name=data['full_name'])
        try:
            validate_password(data['password'], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return data

    def create(self, data):
        user = User.objects.create_user(
            username=data['username'],
            email=data['email'],
            password=data['password'],
            full_name=data['full_name'].strip(),
        )
        user.profile.email_reminders = data['email_reminders']
        user.profile.save(update_fields=['email_reminders'])
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def me_payload(user):
    """Everything the dashboard header needs: who, theme, XP and level."""
    profile = user.profile
    xp = progress.total_xp(user)
    level = progress.level_for_xp(xp)
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'full_name': user.full_name,
        'display_name': profile.display_name or user.full_name.split(' ')[0] or user.username,
        'profile': {
            'timezone': profile.timezone,
            'theme_mode': profile.theme_mode,
            'accent_color': profile.accent_color,
            'email_reminders': profile.email_reminders,
            'reminder_hours_before': profile.reminder_hours_before,
        },
        'xp': xp,
        'level': level,
        'next_level_xp': progress.xp_for_level(level + 1),
    }
