import uuid
import logging
from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.proposal_service import process_proposal_version

logger = logging.getLogger(__name__)

@celery_app.task(name="proposal_tasks.process_proposal_version_task")
def process_proposal_version_task(version_id_str: str):
    logger.info(f"Celery worker processing proposal version task: {version_id_str}")
    db = SessionLocal()
    try:
        version_id = uuid.UUID(version_id_str)
        process_proposal_version(db, version_id)
    except Exception as e:
        logger.error(f"Error in Celery task process_proposal_version_task: {str(e)}")
        raise e
    finally:
        db.close()
