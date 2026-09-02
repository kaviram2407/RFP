import uuid
import logging
from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.requirement_extraction import extract_requirements_for_version

logger = logging.getLogger(__name__)

@celery_app.task(name="requirement_tasks.extract_requirements_task")
def extract_requirements_task(version_id_str: str):
    logger.info(f"Celery worker extracting requirements task for version: {version_id_str}")
    db = SessionLocal()
    try:
        version_id = uuid.UUID(version_id_str)
        extract_requirements_for_version(db, version_id)
    except Exception as e:
        logger.error(f"Error in Celery task extract_requirements_task: {str(e)}")
        raise e
    finally:
        db.close()
