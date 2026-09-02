import uuid
import logging
from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.document_processing import process_document_version

logger = logging.getLogger(__name__)

@celery_app.task(name="document_tasks.process_document_version_task")
def process_document_version_task(version_id_str: str):
    logger.info(f"Celery worker processing document version task: {version_id_str}")
    db = SessionLocal()
    try:
        version_id = uuid.UUID(version_id_str)
        process_document_version(db, version_id)
    except Exception as e:
        logger.error(f"Error in Celery task process_document_version_task: {str(e)}")
        raise e
    finally:
        db.close()
