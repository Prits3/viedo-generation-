"""Lumina Learn — modular learning-video backend. See ARCHITECTURE.md."""
from .config import settings, Settings, PROMPT_VERSION, SCENE_SCHEMA_VERSION
from .db import Database
from .security import create_user, authenticate, AuthError
from .services import (ResourceService, LessonService, TutorService,
                       PracticeService, lesson_handlers)
from . import jobs, content

__all__ = ["settings", "Settings", "PROMPT_VERSION", "SCENE_SCHEMA_VERSION",
           "Database", "create_user", "authenticate", "AuthError",
           "ResourceService", "LessonService", "TutorService", "PracticeService",
           "lesson_handlers", "jobs", "content"]
