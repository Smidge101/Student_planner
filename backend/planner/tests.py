from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from . import progress
from .models import (
    Achievement,
    Assignment,
    CalendarEvent,
    ClassMeeting,
    Course,
    PomodoroSession,
    Profile,
    Term,
    XPEvent,
)

User = get_user_model()


def make_user(name='ana'):
    return User.objects.create_user(name, f'{name}@example.com', 'pw-for-tests-123')


class ProfileTests(TestCase):
    def test_new_user_gets_a_profile(self):
        user = make_user()
        self.assertTrue(Profile.objects.filter(user=user).exists())
        self.assertEqual(user.profile.timezone, 'UTC')


class AchievementSeedTests(TestCase):
    def test_catalog_is_seeded(self):
        self.assertEqual(Achievement.objects.count(), 11)
        self.assertTrue(Achievement.objects.get(slug='busy-bee').hidden)
        self.assertFalse(Achievement.objects.get(slug='baby-steps').hidden)


class ConstraintTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.term = Term.objects.create(
            user=self.user, name='Fall', start_date=date(2026, 8, 25), end_date=date(2026, 12, 15)
        )

    def assertRejected(self, create):
        with self.assertRaises(IntegrityError), transaction.atomic():
            create()

    def test_term_cannot_end_before_it_starts(self):
        self.assertRejected(lambda: Term.objects.create(
            user=self.user, name='Bad', start_date=date(2026, 9, 1), end_date=date(2026, 8, 1)
        ))

    def test_two_courses_in_a_term_cannot_share_a_color(self):
        Course.objects.create(user=self.user, term=self.term, name='Bio', color='mint')
        self.assertRejected(lambda: Course.objects.create(
            user=self.user, term=self.term, name='Chem', color='mint'
        ))

    def test_other_users_can_use_the_same_color(self):
        Course.objects.create(user=self.user, term=self.term, name='Bio', color='mint')
        other = make_user('ben')
        other_term = Term.objects.create(
            user=other, name='Fall', start_date=date(2026, 8, 25), end_date=date(2026, 12, 15)
        )
        Course.objects.create(user=other, term=other_term, name='Bio', color='mint')

    def test_meeting_must_end_after_it_starts(self):
        course = Course.objects.create(user=self.user, term=self.term, name='Bio', color='mint')
        self.assertRejected(lambda: ClassMeeting.objects.create(
            course=course, weekday=0, start_time=time(11), end_time=time(10)
        ))

    def test_pomodoro_cannot_complete_more_sets_than_planned(self):
        self.assertRejected(lambda: PomodoroSession.objects.create(
            user=self.user, work_minutes=25, break_minutes=5, planned_sets=2, completed_sets=3
        ))


class LevelTests(TestCase):
    def test_level_curve(self):
        self.assertEqual(progress.level_for_xp(0), 0)
        self.assertEqual(progress.level_for_xp(5), 1)
        self.assertEqual(progress.level_for_xp(24), 1)
        self.assertEqual(progress.level_for_xp(25), 2)
        self.assertEqual(progress.level_for_xp(99), 2)
        self.assertEqual(progress.level_for_xp(100), 3)

    def test_xp_for_level_matches_level_for_xp(self):
        for level in range(1, 30):
            needed = progress.xp_for_level(level)
            self.assertEqual(progress.level_for_xp(needed), level)
            if level > 1:
                self.assertEqual(progress.level_for_xp(needed - 1), level - 1)


class XPTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.course = Course.objects.create(user=self.user, name='Bio', color='mint')
        self.exam = Assignment.objects.create(
            user=self.user, course=self.course, title='Midterm',
            kind=Assignment.Kind.EXAM, due_at=timezone.now() + timedelta(days=3),
        )

    def test_first_task_reaches_level_one(self):
        progress.complete_assignment(self.exam)
        self.assertEqual(progress.total_xp(self.user), 15)
        self.assertEqual(progress.level_for_xp(progress.total_xp(self.user)), 1)

    def test_completing_twice_awards_once(self):
        progress.complete_assignment(self.exam)
        self.assertEqual(progress.complete_assignment(self.exam), 0)
        self.assertEqual(progress.total_xp(self.user), 15)

    def test_toggling_cannot_farm_xp(self):
        for _ in range(5):
            progress.complete_assignment(self.exam)
            progress.uncomplete_assignment(self.exam)
        self.assertEqual(progress.total_xp(self.user), 0)
        progress.complete_assignment(self.exam)
        self.assertEqual(progress.total_xp(self.user), 15)

    def test_deleting_a_course_removes_its_work_but_keeps_xp(self):
        progress.complete_assignment(self.exam)
        self.course.delete()
        self.assertFalse(Assignment.objects.filter(pk=self.exam.pk).exists())
        self.assertEqual(progress.total_xp(self.user), 15)

    def test_events_award_xp(self):
        start = timezone.now()
        event = CalendarEvent.objects.create(
            user=self.user, title='Study group', start_at=start, end_at=start + timedelta(hours=1)
        )
        progress.complete_event(event)
        progress.uncomplete_event(event)
        progress.complete_event(event)
        self.assertEqual(progress.total_xp(self.user), 20)

    def test_xp_is_per_user(self):
        progress.complete_assignment(self.exam)
        self.assertEqual(progress.total_xp(make_user('ben')), 0)

    def test_deleting_a_user_removes_all_their_data(self):
        progress.complete_assignment(self.exam)
        self.user.delete()
        self.assertEqual(Course.objects.count(), 0)
        self.assertEqual(Assignment.objects.count(), 0)
        self.assertEqual(XPEvent.objects.count(), 0)
        self.assertEqual(Profile.objects.count(), 0)
