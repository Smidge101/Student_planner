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


class OwnershipTests(TestCase):
    """User B must never see or change user A's data through the API."""

    def setUp(self):
        self.ana = make_user('ana')
        self.ben = make_user('ben')
        self.ana_term = Term.objects.create(
            user=self.ana, name='Ana Fall', start_date=date(2026, 8, 25), end_date=date(2026, 12, 15)
        )
        self.client.force_login(self.ben)

    def test_list_shows_only_own_rows(self):
        Term.objects.create(
            user=self.ben, name='Ben Fall', start_date=date(2026, 8, 25), end_date=date(2026, 12, 15)
        )
        names = [t['name'] for t in self.client.get('/api/terms/').json()]
        self.assertEqual(names, ['Ben Fall'])

    def test_cannot_read_update_or_delete_another_users_row(self):
        url = f'/api/terms/{self.ana_term.pk}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {'name': 'hacked'}, content_type='application/json').status_code, 404
        )
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.ana_term.refresh_from_db()
        self.assertEqual(self.ana_term.name, 'Ana Fall')

    def test_create_always_belongs_to_the_logged_in_user(self):
        response = self.client.post(
            '/api/terms/',
            {'name': 'Spring', 'start_date': '2027-01-10', 'end_date': '2027-05-01', 'user': self.ana.pk},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Term.objects.get(pk=response.json()['id']).user, self.ben)

    def test_api_rejects_term_ending_before_start(self):
        response = self.client.post(
            '/api/terms/',
            {'name': 'Bad', 'start_date': '2027-05-01', 'end_date': '2027-01-10'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_logged_out_users_get_nothing(self):
        self.client.logout()
        self.assertEqual(self.client.get('/api/terms/').status_code, 403)


class DashboardTests(TestCase):
    def setUp(self):
        self.ana = make_user('ana')
        self.client.force_login(self.ana)
        now = timezone.now()
        course = Course.objects.create(user=self.ana, name='Bio', color='mint')
        Assignment.objects.create(user=self.ana, course=course, title='Overdue lab', due_at=now - timedelta(days=1))
        Assignment.objects.create(user=self.ana, title='Essay', due_at=now + timedelta(days=2))
        done = Assignment.objects.create(user=self.ana, title='Done already', due_at=now + timedelta(days=1))
        progress.complete_assignment(done)
        CalendarEvent.objects.create(
            user=self.ana, title='Study group', start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=1, hours=1),
        )
        CalendarEvent.objects.create(
            user=self.ana, title='Far away', start_at=now + timedelta(days=30),
            end_at=now + timedelta(days=30, hours=1),
        )
        # Another user's data must never appear.
        ben = make_user('ben')
        Assignment.objects.create(user=ben, title='Ben task', due_at=now + timedelta(hours=1))

    def test_dashboard_lists_own_upcoming_work(self):
        body = self.client.get('/api/dashboard/').json()
        self.assertEqual([t['title'] for t in body['upcoming_tasks']], ['Overdue lab', 'Essay'])
        self.assertTrue(body['upcoming_tasks'][0]['overdue'])
        self.assertEqual(body['upcoming_tasks'][0]['course']['color'], 'mint')
        self.assertEqual([e['title'] for e in body['upcoming_events']], ['Study group'])
        self.assertTrue(body['has_courses'])

    def test_profile_theme_can_be_changed(self):
        response = self.client.patch(
            '/api/auth/me/', {'theme_mode': 'dark', 'accent_color': 'mint'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['profile']['accent_color'], 'mint')
        self.assertEqual(response.json()['profile']['theme_mode'], 'dark')

    def test_invalid_theme_color_is_rejected(self):
        response = self.client.patch(
            '/api/auth/me/', {'accent_color': 'neon'}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
