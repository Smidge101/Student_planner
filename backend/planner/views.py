from rest_framework import serializers, viewsets

from .models import Term


class OwnedViewSet(viewsets.ModelViewSet):
    """Base for every student-data endpoint.

    Every query is limited to the logged-in user's rows, and new rows are
    always saved with that user. Another user's id gives a 404, not a 403, so
    the API doesn't even reveal that the row exists.
    """

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = ['id', 'name', 'start_date', 'end_date']

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'A term must end after it starts.'})
        return data


class TermViewSet(OwnedViewSet):
    queryset = Term.objects.all()
    serializer_class = TermSerializer
