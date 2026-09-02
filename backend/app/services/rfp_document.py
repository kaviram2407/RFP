from typing import Tuple, List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, UploadFile
from datetime import datetime, timezone
import uuid
import math

from app.models.rfp_project import RFPProject
from app.models.rfp_document import RFPDocument, DocumentVersion, DocumentStatusEnum, ProcessingStatusEnum
from app.models.user import User
from app.services.storage import validate_uploaded_file, storage_service

def enqueue_processing(version_id: uuid.UUID):
    try:
        from app.tasks.document_tasks import process_document_version_task
        process_document_version_task.delay(str(version_id))
    except Exception:
        # Fallback to direct synchronous execution if Celery broker is unavailable in local test
        try:
            from app.db.session import SessionLocal
            from app.services.document_processing import process_document_version
            db_sync = SessionLocal()
            try:
                process_document_version(db_sync, version_id)
            finally:
                db_sync.close()
        except Exception:
            pass


def verify_project_ownership(db: Session, current_user: User, project_id: uuid.UUID) -> RFPProject:
    project = db.query(RFPProject).filter(
        RFPProject.id == project_id,
        RFPProject.organization_id == current_user.organization_id
    ).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RFP Project not found."
        )
    return project

def upload_document(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    upload_file: UploadFile
) -> RFPDocument:
    verify_project_ownership(db, current_user, project_id)

    # Read content bytes
    content_bytes = upload_file.file.read()
    filename = upload_file.filename or "file.pdf"
    content_type = upload_file.content_type or "application/octet-stream"

    # Validate file
    doc_type, checksum = validate_uploaded_file(filename, content_type, content_bytes)

    # Generate UUIDs for Document and Version 1
    doc_id = uuid.uuid4()
    version_id = uuid.uuid4()

    # Storage key structure: organizations/{org_id}/rfp-projects/{project_id}/documents/{doc_id}/versions/{version_id}
    storage_key = (
        f"organizations/{current_user.organization_id}/"
        f"rfp-projects/{project_id}/"
        f"documents/{doc_id}/"
        f"versions/{version_id}"
    )

    # 1. Upload to R2 first
    storage_service.upload_file_bytes(storage_key, content_bytes, content_type)

    # 2. Create DB records
    document = RFPDocument(
        id=doc_id,
        organization_id=current_user.organization_id,
        rfp_project_id=project_id,
        created_by_id=current_user.id,
        name=filename,
        document_type=doc_type,
        status=DocumentStatusEnum.ACTIVE,
    )
    db.add(document)
    db.flush()

    version = DocumentVersion(
        id=version_id,
        organization_id=current_user.organization_id,
        rfp_document_id=doc_id,
        created_by_id=current_user.id,
        version_number=1,
        original_filename=filename,
        storage_key=storage_key,
        content_type=content_type,
        file_size_bytes=len(content_bytes),
        checksum_sha256=checksum,
    )
    db.add(version)
    db.flush()

    document.current_version_id = version_id

    try:
        db.commit()
        db.refresh(document)
        enqueue_processing(version_id)
    except Exception as e:
        db.rollback()
        # Clean up R2 object if DB commit fails
        storage_service.delete_file(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failed: {str(e)}"
        )

    return document

def upload_new_version(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    upload_file: UploadFile
) -> RFPDocument:
    verify_project_ownership(db, current_user, project_id)

    document = db.query(RFPDocument).filter(
        RFPDocument.id == document_id,
        RFPDocument.rfp_project_id == project_id,
        RFPDocument.organization_id == current_user.organization_id
    ).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RFPDocument not found."
        )

    content_bytes = upload_file.file.read()
    filename = upload_file.filename or document.name
    content_type = upload_file.content_type or "application/octet-stream"

    doc_type, checksum = validate_uploaded_file(filename, content_type, content_bytes)

    # Determine next version number
    max_v = db.query(DocumentVersion).filter(
        DocumentVersion.rfp_document_id == document_id
    ).count()
    next_v = max_v + 1

    version_id = uuid.uuid4()
    storage_key = (
        f"organizations/{current_user.organization_id}/"
        f"rfp-projects/{project_id}/"
        f"documents/{document_id}/"
        f"versions/{version_id}"
    )

    # Upload to R2
    storage_service.upload_file_bytes(storage_key, content_bytes, content_type)

    version = DocumentVersion(
        id=version_id,
        organization_id=current_user.organization_id,
        rfp_document_id=document_id,
        created_by_id=current_user.id,
        version_number=next_v,
        original_filename=filename,
        storage_key=storage_key,
        content_type=content_type,
        file_size_bytes=len(content_bytes),
        checksum_sha256=checksum,
    )
    db.add(version)
    db.flush()

    document.current_version_id = version_id
    document.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(document)
        enqueue_processing(version_id)
    except Exception as e:
        db.rollback()
        storage_service.delete_file(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failed: {str(e)}"
        )

    return document

def list_documents(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[RFPDocument], int, int]:
    verify_project_ownership(db, current_user, project_id)

    query = db.query(RFPDocument).filter(
        RFPDocument.rfp_project_id == project_id,
        RFPDocument.organization_id == current_user.organization_id
    )
    total = query.count()
    pages = math.ceil(total / page_size) if total > 0 else 1

    items = (
        query.order_by(RFPDocument.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total, pages

def get_document(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    document_id: uuid.UUID
) -> RFPDocument:
    verify_project_ownership(db, current_user, project_id)

    document = db.query(RFPDocument).filter(
        RFPDocument.id == document_id,
        RFPDocument.rfp_project_id == project_id,
        RFPDocument.organization_id == current_user.organization_id
    ).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RFPDocument not found."
        )
    return document

def get_document_versions(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    document_id: uuid.UUID
) -> List[DocumentVersion]:
    get_document(db, current_user, project_id, document_id)
    return db.query(DocumentVersion).filter(
        DocumentVersion.rfp_document_id == document_id,
        DocumentVersion.organization_id == current_user.organization_id
    ).order_by(DocumentVersion.version_number.desc()).all()

def generate_download_url(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    version_id: uuid.UUID = None
) -> Tuple[str, int]:
    document = get_document(db, current_user, project_id, document_id)
    if version_id:
        version = db.query(DocumentVersion).filter(
            DocumentVersion.id == version_id,
            DocumentVersion.rfp_document_id == document_id,
            DocumentVersion.organization_id == current_user.organization_id
        ).first()
        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document version not found."
            )
    else:
        version = document.current_version
        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active version available for this document."
            )

    expires_in = 3600  # 1 hour
    url = storage_service.generate_presigned_download_url(version.storage_key, expires_in=expires_in)
    return url, expires_in

def archive_document(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    document_id: uuid.UUID
) -> RFPDocument:
    document = get_document(db, current_user, project_id, document_id)
    if document.status == DocumentStatusEnum.ARCHIVED:
        return document

    now = datetime.now(timezone.utc)
    document.status = DocumentStatusEnum.ARCHIVED
    document.archived_at = now
    document.updated_at = now

    db.commit()
    db.refresh(document)
    return document
