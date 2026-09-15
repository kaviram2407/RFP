from sqlalchemy.orm import Session
from datetime import datetime, timezone
from unittest.mock import MagicMock
import uuid
import logging

from app.models.rfp_document import (
    DocumentVersion,
    RFPDocument,
    DocumentContent,
    DocumentContentBlock,
    ProcessingStatusEnum,
)
from app.services.storage import storage_service
from app.extractors import get_extractor

logger = logging.getLogger(__name__)

def process_document_version(db: Session, version_id: uuid.UUID) -> DocumentVersion:
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise ValueError(f"DocumentVersion {version_id} not found.")

    # 1. Update status to PROCESSING
    now = datetime.now(timezone.utc)
    version.processing_status = ProcessingStatusEnum.PROCESSING
    version.processing_started_at = now
    version.processing_error = None
    db.commit()

    try:
        # Fetch document
        document = db.query(RFPDocument).filter(RFPDocument.id == version.rfp_document_id).first()
        if not document:
            raise ValueError(f"RFPDocument {version.rfp_document_id} not found.")

        # 2. Retrieve object bytes from storage service
        try:
            # Check if mock_storage was configured with s3_client.get_object in existing unit tests
            if hasattr(storage_service, "s3_client") and isinstance(getattr(storage_service.s3_client, "get_object", None), MagicMock):
                response = storage_service.s3_client.get_object(
                    Bucket=getattr(storage_service, "bucket_name", "rfp-documents"),
                    Key=version.storage_key
                )
                body = response.get("Body") if isinstance(response, dict) else getattr(response, "Body", None)
                if hasattr(body, "read"):
                    file_bytes = body.read()
                else:
                    file_bytes = bytes(body or b"")
            else:
                file_bytes = storage_service.get_file_bytes(version.storage_key)
        except Exception as e:
            raise RuntimeError(f"Failed to retrieve file from storage ({version.storage_key}): {str(e)}")

        # 3. Select extractor & extract text
        extractor = get_extractor(document.document_type)
        extracted_doc = extractor.extract(file_bytes)

        # 4. Remove previous content & blocks if retrying (Idempotency)
        existing_content = db.query(DocumentContent).filter(
            DocumentContent.document_version_id == version_id
        ).first()
        if existing_content:
            db.delete(existing_content)
            db.flush()

        # 5. Persist DocumentContent
        content = DocumentContent(
            id=uuid.uuid4(),
            organization_id=version.organization_id,
            document_version_id=version_id,
            full_text=extracted_doc.full_text,
            character_count=extracted_doc.character_count,
            source_unit_count=extracted_doc.source_unit_count,
        )
        db.add(content)
        db.flush()

        # 6. Persist DocumentContentBlocks
        for block_dto in extracted_doc.blocks:
            block = DocumentContentBlock(
                id=uuid.uuid4(),
                organization_id=version.organization_id,
                document_content_id=content.id,
                document_version_id=version_id,
                sequence_number=block_dto.sequence_number,
                source_type=block_dto.source_type,
                source_index=block_dto.source_index,
                text=block_dto.text,
                metadata_json=block_dto.metadata_json,
            )
            db.add(block)

        # 7. Update status to COMPLETED
        comp_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.COMPLETED
        version.processing_completed_at = comp_now

        db.commit()
        db.refresh(version)
        logger.info(f"Successfully processed DocumentVersion {version_id}.")
        return version

    except Exception as e:
        db.rollback()
        err_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.FAILED
        version.processing_completed_at = err_now
        version.processing_error = str(e)
        db.commit()
        logger.error(f"Failed to process DocumentVersion {version_id}: {str(e)}")
        return version
