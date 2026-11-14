from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('terms', views.TermViewSet, basename='term')
router.register('courses', views.CourseViewSet, basename='course')
router.register('assignments', views.AssignmentViewSet, basename='assignment')
router.register('events', views.CalendarEventViewSet, basename='event')
router.register('pomodoro', views.PomodoroViewSet, basename='pomodoro')

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
    path('achievements/', views.achievement_list, name='achievements'),
    path('achievements/unseen/', views.unseen_achievements, name='achievements-unseen'),
    path('progress/', views.progress_summary, name='progress'),
    path('achievements/seen/', views.mark_achievements_seen, name='achievements-seen'),
    *router.urls,
]
