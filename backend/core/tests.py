from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase

User = get_user_model()

GOOD_SIGNUP = {
    'full_name': 'Ana Lopez',
    'email': 'Ana@Example.com',
    'username': 'ana',
    'password': 'pastel-planner-42',
    'password_confirm': 'pastel-planner-42',
    'email_reminders': False,
}


class APITestCase(TestCase):
    """Uses a client that enforces CSRF like a real browser does."""

    def setUp(self):
        cache.clear()  # reset rate limits between tests
        self.client = Client(enforce_csrf_checks=True)

    def csrf_token(self):
        self.client.get('/api/auth/csrf/')
        return self.client.cookies['csrftoken'].value

    def post(self, url, data=None):
        return self.client.post(
            url, data or {}, content_type='application/json',
            HTTP_X_CSRFTOKEN=self.csrf_token(),
        )


class HealthCheckTests(APITestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')


class SignupTests(APITestCase):
    def test_signup_creates_account_and_logs_in(self):
        response = self.post('/api/auth/signup/', GOOD_SIGNUP)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['email'], 'ana@example.com')  # normalized
        self.assertEqual(body['display_name'], 'Ana')
        self.assertEqual(body['level'], 0)
        self.assertFalse(body['profile']['email_reminders'])
        self.assertNotIn('password', body)

        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['username'], 'ana')

    def test_password_is_hashed(self):
        self.post('/api/auth/signup/', GOOD_SIGNUP)
        user = User.objects.get(username='ana')
        self.assertNotEqual(user.password, GOOD_SIGNUP['password'])
        self.assertTrue(user.check_password(GOOD_SIGNUP['password']))

    def test_passwords_must_match(self):
        response = self.post('/api/auth/signup/', {**GOOD_SIGNUP, 'password_confirm': 'nope-nope-42'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('password_confirm', response.json())

    def test_weak_password_rejected(self):
        response = self.post(
            '/api/auth/signup/', {**GOOD_SIGNUP, 'password': '12345678', 'password_confirm': '12345678'}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.json())

    def test_duplicate_email_and_username_rejected_case_insensitively(self):
        self.post('/api/auth/signup/', GOOD_SIGNUP)
        self.client = Client(enforce_csrf_checks=True)
        response = self.post(
            '/api/auth/signup/', {**GOOD_SIGNUP, 'username': 'ANA', 'email': 'ana@example.COM'}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.json())
        self.assertIn('username', response.json())

    def test_signup_without_csrf_token_is_refused(self):
        response = self.client.post('/api/auth/signup/', GOOD_SIGNUP, content_type='application/json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.exists())


class LoginTests(APITestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user('ana', 'ana@example.com', 'pastel-planner-42', full_name='Ana Lopez')

    def test_login_logout(self):
        response = self.post('/api/auth/login/', {'username': 'ana', 'password': 'pastel-planner-42'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)

        self.assertEqual(self.post('/api/auth/logout/').status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 403)

    def test_username_is_case_insensitive(self):
        response = self.post('/api/auth/login/', {'username': 'ANA', 'password': 'pastel-planner-42'})
        self.assertEqual(response.status_code, 200)

    def test_wrong_password_and_unknown_user_look_the_same(self):
        wrong_pw = self.post('/api/auth/login/', {'username': 'ana', 'password': 'wrong'})
        no_user = self.post('/api/auth/login/', {'username': 'nobody', 'password': 'wrong'})
        self.assertEqual(wrong_pw.status_code, 400)
        self.assertEqual(wrong_pw.json(), no_user.json())

    def test_login_without_csrf_token_is_refused(self):
        response = self.client.post(
            '/api/auth/login/', {'username': 'ana', 'password': 'pastel-planner-42'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_logout_without_csrf_token_is_refused(self):
        self.post('/api/auth/login/', {'username': 'ana', 'password': 'pastel-planner-42'})
        response = self.client.post('/api/auth/logout/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)

    def test_login_attempts_are_rate_limited(self):
        for _ in range(10):
            self.post('/api/auth/login/', {'username': 'ana', 'password': 'wrong'})
        response = self.post('/api/auth/login/', {'username': 'ana', 'password': 'pastel-planner-42'})
        self.assertEqual(response.status_code, 429)

    def test_me_requires_login(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 403)
