from django import forms
from .models import MusicFile

class MusicFileForm(forms.ModelForm):
    class Meta:
        model = MusicFile
        fields = ['file']
        widgets = {
            'file': forms.FileInput(attrs={'class': 'form-control'})
        }

class MusicFileUploadForm(forms.ModelForm):
    class Meta:
        model = MusicFile
        fields = ['file']
        widgets = {
            'file': forms.FileInput(attrs={'class': 'form-control'})
        } 