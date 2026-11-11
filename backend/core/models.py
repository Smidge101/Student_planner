from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user so fields can be added later without a painful migration."""

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
