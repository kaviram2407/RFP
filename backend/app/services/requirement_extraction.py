from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime, timezone
import uuid
import logging

from app.models.rfp_document import (
    DocumentVersion,
    RFPDocument,
    DocumentContentBlock,
    ProcessingStatusEnum,
)
from app.models.requirement import (
    Requirement,
    RequirementEvidence,
    RequirementCategoryEnum,
    RequirementTypeEnum,
    RequirementPriorityEnum,
    RequirementStatusEnum,
    ExtractionStatusEnum,
)
from app.services.llm_client import nvidia_llm_client
from app.core.config import settings

logger = logging.getLogger(__name__)

def extract_requirements_for_version(db: Session, version_id: uuid.UUID) -> DocumentVersion:
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise ValueError(f"DocumentVersion {version_id} not found.")

    if version.processing_status != ProcessingStatusEnum.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document processing must be COMPLETED before requirement extraction can run."
        )

    # 1. Update extraction status to PROCESSING
    now = datetime.now(timezone.utc)
    version.extraction_status = ExtractionStatusEnum.PROCESSING.value
    version.extraction_started_at = now
    version.extraction_error = None
    db.commit()

    try:
        # Load document & blocks
        document = db.query(RFPDocument).filter(RFPDocument.id == version.rfp_document_id).first()
        if not document:
            raise ValueError(f"RFPDocument {version.rfp_document_id} not found.")

        blocks = db.query(DocumentContentBlock).filter(
            DocumentContentBlock.document_version_id == version_id,
            DocumentContentBlock.organization_id == version.organization_id
        ).order_by(DocumentContentBlock.sequence_number.asc()).all()

        if not blocks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No extracted source blocks found for this document version."
            )

        # Build block lookup map for strict validation
        block_map = {str(b.id): b for b in blocks}

        # Build context blocks array
        context_blocks = []
        for b in blocks:
            source_ref = f"{b.source_type.value} {b.source_index}"
            if b.metadata_json and "sheet_name" in b.metadata_json:
                source_ref = f"SHEET: {b.metadata_json['sheet_name']}"
            elif b.metadata_json and "slide_title" in b.metadata_json and b.metadata_json["slide_title"]:
                source_ref = f"SLIDE {b.source_index}: {b.metadata_json['slide_title']}"

            context_blocks.append({
                "id": str(b.id),
                "source_reference": source_ref,
                "text": b.text
            })

        # 2. Call LLM Client
        raw_result = nvidia_llm_client.extract_requirements_from_blocks(context_blocks)
        extracted_candidates = raw_result.get("requirements", [])

        # 3. Idempotent cleanup of old requirements for this version
        old_reqs = db.query(Requirement).filter(
            Requirement.document_version_id == version_id,
            Requirement.organization_id == version.organization_id
        ).all()
        for old_req in old_reqs:
            db.delete(old_req)
        db.flush()

        # Determine starting requirement code index
        existing_count = db.query(Requirement).filter(
            Requirement.rfp_project_id == document.rfp_project_id,
            Requirement.organization_id == version.organization_id
        ).count()
        code_counter = existing_count + 1

        persisted_reqs = []
        seen_titles = set()

        # 4. Validate & Persist Requirements
        for cand in extracted_candidates:
            title = (cand.get("title") or "Untitled Requirement").strip()
            title_lower = title.lower()

            # Deduplication within current run
            if title_lower in seen_titles:
                continue
            seen_titles.add(title_lower)

            description = (cand.get("description") or title).strip()
            
            # Normalize Category
            cat_str = (cand.get("category") or "GENERAL").upper()
            try:
                category = RequirementCategoryEnum(cat_str)
            except ValueError:
                category = RequirementCategoryEnum.GENERAL

            # Normalize Type
            type_str = (cand.get("type") or cand.get("requirement_type") or "MANDATORY").upper()
            try:
                req_type = RequirementTypeEnum(type_str)
            except ValueError:
                req_type = RequirementTypeEnum.MANDATORY

            # Normalize Priority
            prio_str = (cand.get("priority") or "MEDIUM").upper()
            try:
                priority = RequirementPriorityEnum(prio_str)
            except ValueError:
                priority = RequirementPriorityEnum.MEDIUM

            confidence = float(cand.get("confidence_score", 1.0))
            is_mandatory = bool(cand.get("mandatory", req_type == RequirementTypeEnum.MANDATORY))
            review_req = bool(cand.get("review_required", False)) or confidence < settings.REQUIREMENT_EXTRACTION_CONFIDENCE_THRESHOLD

            req_code = f"REQ-{code_counter:04d}"
            code_counter += 1

            req_status = RequirementStatusEnum.REVIEW_REQUIRED if review_req else RequirementStatusEnum.EXTRACTED

            req = Requirement(
                id=uuid.uuid4(),
                organization_id=version.organization_id,
                rfp_project_id=document.rfp_project_id,
                document_version_id=version_id,
                requirement_code=req_code,
                title=title,
                description=description,
                category=category,
                requirement_type=req_type,
                priority=priority,
                mandatory=is_mandatory,
                confidence_score=confidence,
                status=req_status,
                review_required=review_req,
            )
            db.add(req)
            db.flush()

            # 5. Validate Evidence Block IDs (Hallucination Rejection)
            raw_block_ids = cand.get("evidence_block_ids", [])
            valid_evidence_created = False

            for block_id_str in raw_block_ids:
                if block_id_str in block_map:
                    matched_block = block_map[block_id_str]
                    source_ref = f"{matched_block.source_type.value} {matched_block.source_index}"
                    if matched_block.metadata_json and "sheet_name" in matched_block.metadata_json:
                        source_ref = f"SHEET: {matched_block.metadata_json['sheet_name']}"
                    elif matched_block.metadata_json and "slide_title" in matched_block.metadata_json and matched_block.metadata_json["slide_title"]:
                        source_ref = f"SLIDE {matched_block.source_index}: {matched_block.metadata_json['slide_title']}"

                    evidence = RequirementEvidence(
                        id=uuid.uuid4(),
                        organization_id=version.organization_id,
                        requirement_id=req.id,
                        document_version_id=version_id,
                        content_block_id=matched_block.id,
                        evidence_text=matched_block.text,  # Authoritative source text
                        source_type="CURRENT_RFP",
                        source_reference=source_ref,
                        relevance_score=1.0,
                    )
                    db.add(evidence)
                    valid_evidence_created = True

            # If model provided no valid evidence blocks, link first block as fallback & set review_required
            if not valid_evidence_created and blocks:
                fallback_block = blocks[0]
                source_ref = f"{fallback_block.source_type.value} {fallback_block.source_index}"
                evidence = RequirementEvidence(
                    id=uuid.uuid4(),
                    organization_id=version.organization_id,
                    requirement_id=req.id,
                    document_version_id=version_id,
                    content_block_id=fallback_block.id,
                    evidence_text=fallback_block.text,
                    source_type="CURRENT_RFP",
                    source_reference=source_ref,
                    relevance_score=0.5,
                )
                db.add(evidence)
                req.review_required = True
                req.status = RequirementStatusEnum.REVIEW_REQUIRED

            persisted_reqs.append(req)

        # 6. Update extraction status to COMPLETED
        comp_now = datetime.now(timezone.utc)
        version.extraction_status = ExtractionStatusEnum.COMPLETED.value
        version.extraction_completed_at = comp_now
        version.extraction_error = None

        db.commit()
        db.refresh(version)
        logger.info(f"Successfully extracted {len(persisted_reqs)} requirements for DocumentVersion {version_id}.")
        return version

    except Exception as e:
        db.rollback()
        err_now = datetime.now(timezone.utc)
        version.extraction_status = ExtractionStatusEnum.FAILED.value
        version.extraction_completed_at = err_now
        version.extraction_error = str(e)
        db.commit()
        logger.error(f"Requirement extraction failed for DocumentVersion {version_id}: {str(e)}")
        return version
