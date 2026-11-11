from django.conf import settings
from django.db import migrations

ACHIEVEMENTS = [
    # (slug, name, description, hidden)
    ('most-classes', 'Most Classes', 'Take more than 6 classes in one term.', False),
    ('baby-steps', 'Baby Steps', 'Complete 10 tasks.', False),
    ('trailblazer', 'Trailblazer', 'Complete 50 tasks.', False),
    ('ceo', 'CEO', 'Complete 100 tasks.', False),
    ('phoenix', 'Phoenix', 'Complete 1000 tasks.', False),
    ('more-more-more', 'more, More, MORE', 'Add 20 tasks in one sitting.', True),
    ('ultimate-task-taker', 'Ultimate Task Taker', 'Complete 10 tasks in one sitting.', True),
    ('study-study-study', 'Study, Study, Study', 'Finish a Pomodoro session over 4 hours.', True),
    ('bye-bye-byee', 'Bye Bye Byee!~', 'Delete 3 classes in one sitting.', True),
    ('time-traveler', 'Time Traveler', 'Stop the Pomodoro timer 10 times.', True),
    ('busy-bee', 'Busy Bee', 'Have 10 events in one week.', True),
]


def seed(apps, schema_editor):
    Achievement = apps.get_model('planner', 'Achievement')
    for slug, name, description, hidden in ACHIEVEMENTS:
        Achievement.objects.update_or_create(
            slug=slug,
            defaults={'name': name, 'description': description, 'hidden': hidden},
        )


def unseed(apps, schema_editor):
    Achievement = apps.get_model('planner', 'Achievement')
    Achievement.objects.filter(slug__in=[a[0] for a in ACHIEVEMENTS]).delete()


def backfill_profiles(apps, schema_editor):
    """Users created before profiles existed (e.g. your superuser) get one now."""
    User = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))
    Profile = apps.get_model('planner', 'Profile')
    for user in User.objects.filter(profile__isnull=True):
        Profile.objects.create(user=user)


class Migration(migrations.Migration):

    dependencies = [
        ('planner', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
        migrations.RunPython(backfill_profiles, migrations.RunPython.noop),
    ]
