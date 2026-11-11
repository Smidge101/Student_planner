from django.contrib import admin

from .models import Achievement

# Only the badge catalog is in the admin. Students' classes, tasks, events and
# XP are deliberately not registered, so the site owner can't browse them.
admin.site.register(Achievement)
