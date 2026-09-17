import uuid
import logging
from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.proposal_generation import proposal_generation_service

logger = logging.getLogger(__name__)

@celery_app.task(name="proposal_generation_tasks.generate_proposal_version_task")
def generate_proposal_version_task(version_id_str: str, organization_id_str: str):
    logger.info(f"Celery task processing proposal version generation: {version_id_str}")
    db = SessionLocal()
    try:
        version_id = uuid.UUID(version_id_str)
        organization_id = uuid.UUID(organization_id_str)
        proposal_generation_service.generate_proposal_version(db, version_id, organization_id)
    except Exception as e:
        logger.error(f"Error in generate_proposal_version_task: {str(e)}")
        raise e
    finally:
        db.close()

@celery_app.task(name="proposal_generation_tasks.generate_proposal_section_task")
def generate_proposal_section_task(section_id_str: str, organization_id_str: str):
    logger.info(f"Celery task processing proposal section generation: {section_id_str}")
    db = SessionLocal()
    try:
        section_id = uuid.UUID(section_id_str)
        organization_id = uuid.UUID(organization_id_str)
        proposal_generation_service.generate_section(db, section_id, organization_id)
    except Exception as e:
        logger.error(f"Error in generate_proposal_section_task: {str(e)}")
        raise e
    finally:
        db.close()
