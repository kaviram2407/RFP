from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from datetime import datetime, timezone
import uuid
import logging

from app.models.company_knowledge import (
    CompanyKnowledgeDocument,
    KnowledgeDocumentVersion,
    KnowledgeChunk,
    KnowledgeStatusEnum,
)
from app.models.rfp_document import ProcessingStatusEnum
from app.services.knowledge_chunker import knowledge_chunker
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

def process_knowledge_version(db: Session, version_id: uuid.UUID) -> KnowledgeDocumentVersion:
    version = db.query(KnowledgeDocumentVersion).filter(KnowledgeDocumentVersion.id == version_id).first()
    if not version:
        raise ValueError(f"KnowledgeDocumentVersion {version_id} not found.")

    doc = db.query(CompanyKnowledgeDocument).filter(CompanyKnowledgeDocument.id == version.knowledge_document_id).first()
    if not doc:
        raise ValueError(f"CompanyKnowledgeDocument {version.knowledge_document_id} not found.")

    # 1. Update status to PROCESSING
    now = datetime.now(timezone.utc)
    version.processing_status = ProcessingStatusEnum.PROCESSING
    version.processing_started_at = now
    version.processing_error = None
    db.commit()

    try:
        # Get raw content text
        text_content = version.raw_content or ""
        if not text_content and doc.description:
            text_content = f"{doc.title}\n\n{doc.description}"

        if not text_content.strip():
            text_content = f"Company Knowledge: {doc.title}"

        # 2. Chunk text
        chunks = knowledge_chunker.chunk_text(text_content, source_name=doc.title)

        # 3. Idempotent cleanup of existing chunks for this version
        db.query(KnowledgeChunk).filter(
            KnowledgeChunk.knowledge_version_id == version_id,
            KnowledgeChunk.organization_id == version.organization_id
        ).delete()
        db.flush()

        # 4. Generate Embeddings in batch
        chunk_contents = [c.content for c in chunks]
        embeddings = embedding_service.get_embeddings(chunk_contents, input_type="passage")

        is_postgres = db.bind and db.bind.dialect.name == "postgresql"

        # 5. Persist KnowledgeChunk records
        for i, chunk_res in enumerate(chunks):
            emb_vec = embeddings[i] if i < len(embeddings) else None
            
            if is_postgres:
                ts_vec = func.to_tsvector("english", f"{doc.title} {chunk_res.content}")
            else:
                ts_vec = f"{doc.title} {chunk_res.content}"

            chunk_obj = KnowledgeChunk(
                id=uuid.uuid4(),
                organization_id=version.organization_id,
                knowledge_document_id=doc.id,
                knowledge_version_id=version_id,
                chunk_index=chunk_res.chunk_index,
                content=chunk_res.content,
                character_count=chunk_res.character_count,
                source_metadata=chunk_res.source_metadata,
                content_hash=chunk_res.content_hash,
                embedding=emb_vec,
                embedding_model="nvidia/nemotron-3-embed-1b",
                embedding_dimensions=2048,
                search_vector=ts_vec
            )
            db.add(chunk_obj)

        # 6. Update status to COMPLETED
        comp_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.COMPLETED
        version.processing_completed_at = comp_now

        db.commit()
        db.refresh(version)

        logger.info(f"Successfully processed {len(chunks)} chunks for KnowledgeDocumentVersion {version_id}.")
        return version

    except Exception as e:
        db.rollback()
        err_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.FAILED
        version.processing_completed_at = err_now
        version.processing_error = str(e)
        db.commit()
        logger.error(f"Knowledge version processing failed for {version_id}: {str(e)}")
        return version
