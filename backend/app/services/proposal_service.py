from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
import uuid
import logging

from app.models.previous_proposal import (
    PreviousProposal,
    PreviousProposalVersion,
    PreviousProposalSection,
    ProposalStatusEnum,
)
from app.models.rfp_document import ProcessingStatusEnum
from app.services.knowledge_chunker import knowledge_chunker
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

def process_proposal_version(db: Session, version_id: uuid.UUID) -> PreviousProposalVersion:
    version = db.query(PreviousProposalVersion).filter(PreviousProposalVersion.id == version_id).first()
    if not version:
        raise ValueError(f"PreviousProposalVersion {version_id} not found.")

    proposal = db.query(PreviousProposal).filter(PreviousProposal.id == version.previous_proposal_id).first()
    if not proposal:
        raise ValueError(f"PreviousProposal {version.previous_proposal_id} not found.")

    # 1. Update status to PROCESSING
    now = datetime.now(timezone.utc)
    version.processing_status = ProcessingStatusEnum.PROCESSING
    version.processing_started_at = now
    version.processing_error = None
    db.commit()

    try:
        text_content = version.raw_content or ""
        if not text_content and proposal.description:
            text_content = f"{proposal.title}\n\n{proposal.description}"

        if not text_content.strip():
            text_content = f"Previous Proposal: {proposal.title} ({proposal.proposal_reference})"

        # 2. Chunk sections
        chunks = knowledge_chunker.chunk_text(text_content, source_name=proposal.title)

        # 3. Idempotent cleanup of existing sections for this version
        db.query(PreviousProposalSection).filter(
            PreviousProposalSection.proposal_version_id == version_id,
            PreviousProposalSection.organization_id == version.organization_id
        ).delete()
        db.flush()

        # 4. Generate Embeddings
        chunk_contents = [c.content for c in chunks]
        embeddings = embedding_service.get_embeddings(chunk_contents, input_type="passage")

        is_postgres = db.bind and db.bind.dialect.name == "postgresql"

        # 5. Persist PreviousProposalSection records
        for i, chunk_res in enumerate(chunks):
            emb_vec = embeddings[i] if i < len(embeddings) else None

            if is_postgres:
                ts_vec = func.to_tsvector("english", f"{proposal.title} {chunk_res.content}")
            else:
                ts_vec = f"{proposal.title} {chunk_res.content}"

            section_obj = PreviousProposalSection(
                id=uuid.uuid4(),
                organization_id=version.organization_id,
                proposal_id=proposal.id,
                proposal_version_id=version_id,
                section_index=chunk_res.chunk_index,
                section_title=f"Section {chunk_res.chunk_index}",
                content=chunk_res.content,
                character_count=chunk_res.character_count,
                source_metadata=chunk_res.source_metadata,
                content_hash=chunk_res.content_hash,
                embedding=emb_vec,
                embedding_model="nvidia/nemotron-3-embed-1b",
                embedding_dimensions=2048,
                search_vector=ts_vec
            )
            db.add(section_obj)

        # 6. Update status to COMPLETED
        comp_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.COMPLETED
        version.processing_completed_at = comp_now

        db.commit()
        db.refresh(version)
        logger.info(f"Successfully processed {len(chunks)} sections for PreviousProposalVersion {version_id}.")
        return version

    except Exception as e:
        db.rollback()
        err_now = datetime.now(timezone.utc)
        version.processing_status = ProcessingStatusEnum.FAILED
        version.processing_completed_at = err_now
        version.processing_error = str(e)
        db.commit()
        logger.error(f"Proposal version processing failed for {version_id}: {str(e)}")
        return version
