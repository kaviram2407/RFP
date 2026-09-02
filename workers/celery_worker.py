import sys
import os

# Add backend directory to sys.path so worker can import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.celery_app import celery_app
import app.tasks.document_tasks  # Register tasks

__all__ = ("celery_app",)
