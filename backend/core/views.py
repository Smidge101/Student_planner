from django.contrib.auth import authenticate, get_user_model, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import LoginSerializer, SignupSerializer, me_payload

User = get_user_model()


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({
        "status": "success",
        "message": "StudyWebPlanner backend is running!"
    })


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    """Sets the csrftoken cookie. The React app calls this once on load and
    sends the cookie's value back in the X-CSRFToken header on every POST."""
    return Response(status=status.HTTP_204_NO_CONTENT)


class AnonymousAuthView(APIView):
    """Base for login and signup.

    DRF only checks CSRF for requests that are already logged in, so these two
    check it themselves; otherwise another site could log a visitor into an
    attacker's account. Attempts are rate limited per IP.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        SessionAuthentication().enforce_csrf(request)


class SignupView(AnonymousAuthView):
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        return Response(me_payload(user), status=status.HTTP_201_CREATED)


class LoginView(AnonymousAuthView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip()
        # Usernames are matched case-insensitively ("Ana" logs in as "ana").
        match = User.objects.filter(username__iexact=username).values_list('username', flat=True).first()
        user = authenticate(
            request,
            username=match or username,
            password=serializer.validated_data['password'],
        )
        if user is None:
            # Same message whether the username or the password was wrong.
            return Response(
                {'detail': 'Incorrect username or password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        login(request, user)
        return Response(me_payload(user))


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
def me(request):
    return Response(me_payload(request.user))
