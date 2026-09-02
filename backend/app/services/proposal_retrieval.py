from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import uuid
import math
import logging

from app.models.previous_proposal import (
    PreviousProposal,
    PreviousProposalVersion,
    PreviousProposalSection,
    ProposalStatusEnum,
    ProposalOutcomeEnum,
)
from app.services.embedding_service import embedding_service
from app.core.config import settings

logger = logging.getLogger(__name__)

OUTCOME_BOOST_MAP = {
    ProposalOutcomeEnum.WON: 1.10,        # +10% boost for won proposals
    ProposalOutcomeEnum.NO_DECISION: 1.0,
    ProposalOutcomeEnum.UNKNOWN: 1.0,
    ProposalOutcomeEnum.LOST: 0.95,       # Searchable, small 5% discount
}

class ProposalRetrievalResult:
    def __init__(
        self,
        section_id: uuid.UUID,
        proposal_id: uuid.UUID,
        proposal_version_id: uuid.UUID,
        proposal_title: str,
        proposal_reference: str,
        customer_name: Optional[str],
        proposal_date: Optional[str],
        outcome: str,
        status: str,
        section_title: Optional[str],
        content: str,
        final_score: float,
        semantic_score: float,
        lexical_score: float,
        recency_score: float,
        source_metadata: Optional[Dict[str, Any]],
        source_class: str = "HISTORICAL PROPOSAL",
    ):
        self.section_id = section_id
        self.proposal_id = proposal_id
        self.proposal_version_id = proposal_version_id
        self.proposal_title = proposal_title
        self.proposal_reference = proposal_reference
        self.customer_name = customer_name
        self.proposal_date = proposal_date
        self.outcome = outcome
        self.status = status
        self.section_title = section_title
        self.content = content
        self.final_score = final_score
        self.semantic_score = semantic_score
        self.lexical_score = lexical_score
        self.recency_score = recency_score
        self.source_metadata = source_metadata
        self.source_class = source_class  # Always "HISTORICAL PROPOSAL"

class PreviousProposalRetrievalService:
    def search_proposals(
        self,
        db: Session,
        organization_id: uuid.UUID,
        query_text: str,
        top_k: int = 10,
        outcome: Optional[ProposalOutcomeEnum] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[ProposalRetrievalResult]:
        """
        Performs hybrid semantic + lexical search over APPROVED historical proposals.
        Applies recency decay scoring and outcome signals.
        Strictly enforces tenant isolation (organization_id).
        """
        if not query_text or not query_text.strip():
            return []

        # 1. Embed query vector
        query_embeddings = embedding_service.get_embeddings([query_text], input_type="query")
        query_vec = query_embeddings[0] if query_embeddings else None

        # 2. Base Query Filters: APPROVED status & tenant isolation
        base_filters = [
            PreviousProposalSection.organization_id == organization_id,
            PreviousProposal.status == ProposalStatusEnum.APPROVED,
        ]

        if outcome:
            base_filters.append(PreviousProposal.outcome == outcome)
        if date_from:
            base_filters.append(PreviousProposal.proposal_date >= date_from)
        if date_to:
            base_filters.append(PreviousProposal.proposal_date <= date_to)

        # 3. Retrieve Candidate Sections
        sections_query = (
            db.query(PreviousProposalSection, PreviousProposal)
            .join(PreviousProposal, PreviousProposalSection.proposal_id == PreviousProposal.id)
            .filter(*base_filters)
            .limit(top_k * 4)
            .all()
        )

        if not sections_query:
            return []

        results = []
        sem_weight = settings.HYBRID_SEARCH_SEMANTIC_WEIGHT  # 0.70
        lex_weight = settings.HYBRID_SEARCH_LEXICAL_WEIGHT   # 0.30

        query_words = set(query_text.lower().split())
        now = datetime.now(timezone.utc)

        for sec, prop in sections_query:
            # Semantic Score (Cosine)
            sem_score = 0.5
            if query_vec and sec.embedding is not None:
                try:
                    dot_prod = sum(a * b for a, b in zip(query_vec, sec.embedding))
                    sem_score = max(0.0, min(1.0, (dot_prod + 1.0) / 2.0))
                except Exception:
                    sem_score = 0.5

            # Lexical Keyword Match
            content_lower = sec.content.lower()
            title_lower = prop.title.lower()
            matched_words = sum(1 for w in query_words if w in content_lower or w in title_lower)
            lex_score = min(1.0, matched_words / max(1, len(query_words)))

            # Recency Decay Score: exp(-age_days / 365)
            recency_score = 1.0
            if prop.proposal_date:
                p_date = prop.proposal_date if prop.proposal_date.tzinfo else prop.proposal_date.replace(tzinfo=timezone.utc)
                age_days = max(0, (now - p_date).days)
                recency_score = round(math.exp(-age_days / 365.0), 3)

            # Combined Score
            raw_score = (sem_score * sem_weight) + (lex_score * lex_weight)
            raw_score = (raw_score * 0.85) + (recency_score * 0.15)  # 15% recency influence

            # Outcome Signal Boost
            outcome_boost = OUTCOME_BOOST_MAP.get(prop.outcome, 1.0)
            final_score = round(min(1.0, raw_score * outcome_boost), 4)

            results.append(
                ProposalRetrievalResult(
                    section_id=sec.id,
                    proposal_id=prop.id,
                    proposal_version_id=sec.proposal_version_id,
                    proposal_title=prop.title,
                    proposal_reference=prop.proposal_reference,
                    customer_name=prop.customer_name,
                    proposal_date=prop.proposal_date.isoformat() if prop.proposal_date else None,
                    outcome=prop.outcome.value,
                    status=prop.status.value,
                    section_title=sec.section_title,
                    content=sec.content,
                    final_score=final_score,
                    semantic_score=round(sem_score, 4),
                    lexical_score=round(lex_score, 4),
                    recency_score=recency_score,
                    source_metadata=sec.source_metadata,
                    source_class="HISTORICAL PROPOSAL",
                )
            )

        results.sort(key=lambda r: r.final_score, reverse=True)
        return results[:top_k]

previous_proposal_retrieval_service = PreviousProposalRetrievalService()
