from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('terms', views.TermViewSet, basename='term')

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
    *router.urls,
]
