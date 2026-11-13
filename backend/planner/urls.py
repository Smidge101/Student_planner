from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('terms', views.TermViewSet, basename='term')
router.register('courses', views.CourseViewSet, basename='course')
router.register('assignments', views.AssignmentViewSet, basename='assignment')

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
    path('achievements/unseen/', views.unseen_achievements, name='achievements-unseen'),
    path('achievements/seen/', views.mark_achievements_seen, name='achievements-seen'),
    *router.urls,
]
