"""API tests for classes, tasks and achievement unlocks."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from . import progress
from .models import Activity, Assignment, CalendarEvent, Course, UserAchievement, XPEvent

User = get_user_model()
JSON = 'application/json'


def make_user(name):
    return User.objects.create_user(name, f'{name}@example.com', 'pw-for-tests-123')


class APITest(TestCase):
    def setUp(self):
        self.ana = make_user('ana')
        self.client.force_login(self.ana)

    def post(self, url, data=None):
        return self.client.post(url, data or {}, content_type=JSON)

    def patch(self, url, data):
        return self.client.patch(url, data, content_type=JSON)

    def add_course(self, name='Bio', color='mint', **extra):
        response = self.post('/api/courses/', {'name': name, 'color': color, **extra})
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def add_task(self, course_id=None, title='Essay', kind='homework', days=2):
        response = self.post('/api/assignments/', {
            'title': title, 'kind': kind, 'course': course_id,
            'due_at': (timezone.now() + timedelta(days=days)).isoformat(),
        })
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def unlocked(self):
        return set(UserAchievement.objects.filter(user=self.ana).values_list('achievement__slug', flat=True))


class CourseAPITests(APITest):
    def test_create_with_meetings_and_list(self):
        course = self.add_course(meetings=[
            {'weekday': 2, 'start_time': '10:00', 'end_time': '11:15', 'location': 'Hall B'},
            {'weekday': 0, 'start_time': '10:00', 'end_time': '11:15'},
        ])
        self.assertEqual([m['weekday'] for m in course['meetings']], [0, 2])  # sorted by day
        listed = self.client.get('/api/courses/').json()
        self.assertEqual(listed[0]['name'], 'Bio')
        self.assertEqual([m['weekday'] for m in listed[0]['meetings']], [0, 2])  # sorted
        self.assertEqual(listed[0]['open_tasks'], 0)

    def test_meeting_must_end_after_start(self):
        response = self.post('/api/courses/', {
            'name': 'Bio', 'color': 'mint',
            'meetings': [{'weekday': 0, 'start_time': '11:00', 'end_time': '10:00'}],
        })
        self.assertEqual(response.status_code, 400)

    def test_each_class_needs_its_own_color(self):
        self.add_course('Bio', 'mint')
        response = self.post('/api/courses/', {'name': 'Chem', 'color': 'mint'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Bio', response.json()['color'][0])

    def test_editing_a_class_can_keep_its_own_color(self):
        course = self.add_course('Bio', 'mint')
        response = self.patch(f"/api/courses/{course['id']}/", {'name': 'Biology', 'color': 'mint'})
        self.assertEqual(response.status_code, 200)

    def test_editing_meetings_replaces_them(self):
        course = self.add_course(meetings=[{'weekday': 0, 'start_time': '09:00', 'end_time': '10:00'}])
        response = self.patch(f"/api/courses/{course['id']}/", {
            'meetings': [{'weekday': 4, 'start_time': '13:00', 'end_time': '14:00'}],
        })
        self.assertEqual([m['weekday'] for m in response.json()['meetings']], [4])

    def test_deleting_class_removes_its_work_but_keeps_xp(self):
        course = self.add_course()
        task = self.add_task(course['id'])
        self.post(f"/api/assignments/{task['id']}/complete/")
        self.assertEqual(self.client.delete(f"/api/courses/{course['id']}/").status_code, 204)
        self.assertFalse(Assignment.objects.exists())
        self.assertEqual(progress.total_xp(self.ana), 5)

    def test_cannot_touch_another_users_class(self):
        ben = make_user('ben')
        bens = Course.objects.create(user=ben, name='Ben class', color='pink')
        self.assertEqual(self.client.get(f'/api/courses/{bens.pk}/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/courses/{bens.pk}/').status_code, 404)
        self.assertTrue(Course.objects.filter(pk=bens.pk).exists())
        self.assertEqual(self.client.get('/api/courses/').json(), [])


class AssignmentAPITests(APITest):
    def test_create_filter_and_complete(self):
        course = self.add_course()
        task = self.add_task(course['id'], kind='exam')
        self.add_task(None, title='Loose task')
        self.assertEqual(task['xp'], 15)

        in_course = self.client.get(f"/api/assignments/?course={course['id']}").json()
        self.assertEqual([t['title'] for t in in_course], ['Essay'])

        response = self.post(f"/api/assignments/{task['id']}/complete/")
        self.assertEqual(response.json()['xp_change'], 15)
        self.assertIsNotNone(response.json()['assignment']['completed_at'])
        self.assertEqual(self.client.get('/api/auth/me/').json()['xp'], 15)

        self.assertEqual(len(self.client.get('/api/assignments/?status=open').json()), 1)
        self.assertEqual(len(self.client.get('/api/assignments/?status=done').json()), 1)
        self.assertEqual(self.client.get(f"/api/courses/{course['id']}/").json()['open_tasks'], 0)

    def test_undo_takes_xp_back(self):
        task = self.add_task()
        self.post(f"/api/assignments/{task['id']}/complete/")
        response = self.post(f"/api/assignments/{task['id']}/uncomplete/")
        self.assertEqual(response.json()['xp_change'], -5)
        self.assertEqual(progress.total_xp(self.ana), 0)

    def test_cannot_change_kind_of_completed_task(self):
        task = self.add_task()
        self.post(f"/api/assignments/{task['id']}/complete/")
        response = self.patch(f"/api/assignments/{task['id']}/", {'kind': 'exam'})
        self.assertEqual(response.status_code, 400)

    def test_cannot_file_task_under_another_users_class(self):
        ben = make_user('ben')
        bens = Course.objects.create(user=ben, name='Ben class', color='pink')
        response = self.post('/api/assignments/', {
            'title': 'Sneaky', 'course': bens.pk, 'due_at': timezone.now().isoformat(),
        })
        self.assertEqual(response.status_code, 400)

    def test_cannot_complete_another_users_task(self):
        ben = make_user('ben')
        bens = Assignment.objects.create(user=ben, title='Ben task', due_at=timezone.now())
        self.assertEqual(self.post(f'/api/assignments/{bens.pk}/complete/').status_code, 404)
        self.assertFalse(XPEvent.objects.exists())

    def test_bad_course_filter_is_ignored(self):
        self.assertEqual(self.client.get('/api/assignments/?course=abc').status_code, 200)

    def test_blank_title_rejected(self):
        response = self.post('/api/assignments/', {'title': '   ', 'due_at': timezone.now().isoformat()})
        self.assertEqual(response.status_code, 400)


class AchievementUnlockTests(APITest):
    def test_baby_steps_after_ten_completions(self):
        tasks = [self.add_task(title=f'T{i}') for i in range(10)]
        for task in tasks[:9]:
            self.post(f"/api/assignments/{task['id']}/complete/")
        self.assertNotIn('baby-steps', self.unlocked())
        self.post(f"/api/assignments/{tasks[9]['id']}/complete/")
        self.assertIn('baby-steps', self.unlocked())
        self.assertIn('ultimate-task-taker', self.unlocked())  # 10 in one sitting

    def test_toggling_one_task_does_not_unlock_anything(self):
        task = self.add_task()
        for _ in range(12):
            self.post(f"/api/assignments/{task['id']}/complete/")
            self.post(f"/api/assignments/{task['id']}/uncomplete/")
        self.assertEqual(self.unlocked(), set())

    def test_more_more_more_after_twenty_tasks_in_a_sitting(self):
        for i in range(19):
            self.add_task(title=f'T{i}')
        self.assertNotIn('more-more-more', self.unlocked())
        self.add_task(title='T19')
        self.assertIn('more-more-more', self.unlocked())

    def test_old_tasks_do_not_count_toward_a_sitting(self):
        for i in range(19):
            self.add_task(title=f'T{i}')
        Assignment.objects.update(created_at=timezone.now() - timedelta(hours=1))
        self.add_task(title='T19')
        self.assertNotIn('more-more-more', self.unlocked())

    def test_most_classes_needs_more_than_six(self):
        colors = ['pink', 'peach', 'butter', 'mint', 'sky', 'periwinkle', 'lavender']
        for i, color in enumerate(colors[:6]):
            self.add_course(f'C{i}', color)
        self.assertNotIn('most-classes', self.unlocked())
        self.add_course('C6', colors[6])
        self.assertIn('most-classes', self.unlocked())

    def test_bye_bye_byee_after_three_deletes_in_a_sitting(self):
        ids = [self.add_course(f'C{i}', c)['id'] for i, c in enumerate(['pink', 'mint', 'sky'])]
        for course_id in ids[:2]:
            self.client.delete(f'/api/courses/{course_id}/')
        self.assertNotIn('bye-bye-byee', self.unlocked())
        self.client.delete(f'/api/courses/{ids[2]}/')
        self.assertIn('bye-bye-byee', self.unlocked())
        self.assertEqual(Activity.objects.filter(user=self.ana).count(), 3)

    def test_unseen_feed_and_mark_seen(self):
        tasks = [self.add_task(title=f'T{i}') for i in range(10)]
        for task in tasks:
            self.post(f"/api/assignments/{task['id']}/complete/")
        unseen = self.client.get('/api/achievements/unseen/').json()
        self.assertEqual({a['slug'] for a in unseen}, {'baby-steps', 'ultimate-task-taker'})

        self.post('/api/achievements/seen/', {'slugs': ['baby-steps', 'ultimate-task-taker']})
        self.assertEqual(self.client.get('/api/achievements/unseen/').json(), [])
        # Still unlocked, just not "new".
        self.assertEqual(len(self.client.get('/api/dashboard/').json()['achievements']), 2)


class CalendarEventAPITests(APITest):
    def add_event(self, title='Study group', start=None, hours=1, **extra):
        start = start or timezone.now() + timedelta(days=1)
        response = self.post('/api/events/', {
            'title': title, 'start_at': start.isoformat(),
            'end_at': (start + timedelta(hours=hours)).isoformat(), **extra,
        })
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_create_and_complete_for_xp(self):
        event = self.add_event(location='Library')
        self.assertEqual(event['xp'], 20)
        response = self.post(f"/api/events/{event['id']}/complete/")
        self.assertEqual(response.json()['xp_change'], 20)
        self.assertEqual(self.post(f"/api/events/{event['id']}/complete/").json()['xp_change'], 0)
        self.assertEqual(self.post(f"/api/events/{event['id']}/uncomplete/").json()['xp_change'], -20)
        self.assertEqual(progress.total_xp(self.ana), 0)

    def test_end_must_not_be_before_start(self):
        start = timezone.now()
        response = self.post('/api/events/', {
            'title': 'Backwards', 'start_at': start.isoformat(),
            'end_at': (start - timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('end_at', response.json())

    def test_range_filter_returns_overlapping_events(self):
        base = timezone.now().replace(microsecond=0) + timedelta(days=10)
        self.add_event('Inside', start=base)
        self.add_event('Before', start=base - timedelta(days=5))
        self.add_event('Spans start', start=base - timedelta(hours=2), hours=3)
        start = (base - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
        end = (base + timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
        titles = {e['title'] for e in self.client.get(f'/api/events/?start={start}&end={end}').json()}
        self.assertEqual(titles, {'Inside', 'Spans start'})

    def test_bad_range_is_a_400(self):
        self.assertEqual(self.client.get('/api/events/?start=yesterday').status_code, 400)

    def test_task_due_date_filter(self):
        self.add_task(title='Soon', days=1)
        self.add_task(title='Later', days=20)
        before = (timezone.now() + timedelta(days=5)).strftime('%Y-%m-%dT%H:%M:%SZ')
        titles = [t['title'] for t in self.client.get(f'/api/assignments/?due_before={before}').json()]
        self.assertEqual(titles, ['Soon'])

    def test_cannot_see_or_complete_another_users_event(self):
        ben = make_user('ben')
        now = timezone.now()
        bens = CalendarEvent.objects.create(user=ben, title='Ben event', start_at=now, end_at=now)
        self.assertEqual(self.client.get('/api/events/').json(), [])
        self.assertEqual(self.post(f'/api/events/{bens.pk}/complete/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/events/{bens.pk}/').status_code, 404)

    def test_busy_bee_after_ten_events_in_one_week(self):
        monday = (timezone.now() + timedelta(days=14)).replace(hour=9, minute=0, second=0, microsecond=0)
        monday -= timedelta(days=monday.weekday())
        for i in range(9):
            self.add_event(f'E{i}', start=monday + timedelta(hours=i * 12))
        self.add_event('Next week', start=monday + timedelta(days=8))
        self.assertNotIn('busy-bee', self.unlocked())
        self.add_event('Tenth', start=monday + timedelta(days=5))
        self.assertIn('busy-bee', self.unlocked())

    def test_signup_stores_browser_time_zone(self):
        self.client.logout()
        response = self.post('/api/auth/signup/', {
            'full_name': 'Cara Diaz', 'email': 'cara@example.com', 'username': 'cara',
            'password': 'pastel-planner-42', 'password_confirm': 'pastel-planner-42',
            'timezone': 'America/Chicago',
        })
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['profile']['timezone'], 'America/Chicago')

    def test_invalid_time_zone_rejected(self):
        response = self.patch('/api/auth/me/', {'timezone': 'Mars/Olympus'})
        self.assertEqual(response.status_code, 400)
