from sqlalchemy.orm import Session
from sqlalchemy import func, select, or_, and_, text
from typing import List, Dict, Any, Optional
import uuid
import logging

from app.models.company_knowledge import (
    CompanyKnowledgeDocument,
    KnowledgeDocumentVersion,
    KnowledgeChunk,
    KnowledgeStatusEnum,
    KnowledgeTypeEnum,
    AuthorityLevelEnum,
)
from app.services.embedding_service import embedding_service
from app.core.config import settings

logger = logging.getLogger(__name__)

AUTHORITY_BOOST_MAP = {
    AuthorityLevelEnum.AUTHORITATIVE: 1.2,
    AuthorityLevelEnum.APPROVED: 1.1,
    AuthorityLevelEnum.INTERNAL: 1.0,
    AuthorityLevelEnum.REFERENCE: 0.9,
}

class HybridRetrievalResult:
    def __init__(
        self,
        chunk_id: uuid.UUID,
        knowledge_document_id: uuid.UUID,
        knowledge_version_id: uuid.UUID,
        title: str,
        content: str,
        final_score: float,
        semantic_score: float,
        lexical_score: float,
        authority_level: str,
        knowledge_type: str,
        source_metadata: Optional[Dict[str, Any]],
        created_at: str,
    ):
        self.chunk_id = chunk_id
        self.knowledge_document_id = knowledge_document_id
        self.knowledge_version_id = knowledge_version_id
        self.title = title
        self.content = content
        self.final_score = final_score
        self.semantic_score = semantic_score
        self.lexical_score = lexical_score
        self.authority_level = authority_level
        self.knowledge_type = knowledge_type
        self.source_metadata = source_metadata
        self.created_at = created_at

class HybridRetrievalService:
    def search_knowledge(
        self,
        db: Session,
        organization_id: uuid.UUID,
        query_text: str,
        top_k: int = 10,
        knowledge_types: Optional[List[KnowledgeTypeEnum]] = None,
        authority_levels: Optional[List[AuthorityLevelEnum]] = None,
    ) -> List[HybridRetrievalResult]:
        """
        Performs hybrid semantic + lexical search over ACTIVE company knowledge chunks.
        Strictly enforces tenant isolation (organization_id).
        """
        if not query_text or not query_text.strip():
            return []

        # 1. Generate query embedding
        query_embeddings = embedding_service.get_embeddings([query_text], input_type="query")
        query_vec = query_embeddings[0] if query_embeddings else None

        # 2. Base Query Filters
        base_filters = [
            KnowledgeChunk.organization_id == organization_id,
            CompanyKnowledgeDocument.status == KnowledgeStatusEnum.ACTIVE,
        ]

        if knowledge_types:
            base_filters.append(CompanyKnowledgeDocument.knowledge_type.in_(knowledge_types))
        if authority_levels:
            base_filters.append(CompanyKnowledgeDocument.authority_level.in_(authority_levels))

        # 3. Retrieve Candidate Chunks
        chunks_query = (
            db.query(KnowledgeChunk, CompanyKnowledgeDocument)
            .join(CompanyKnowledgeDocument, KnowledgeChunk.knowledge_document_id == CompanyKnowledgeDocument.id)
            .filter(*base_filters)
            .limit(top_k * 4)  # Over-fetch for hybrid re-ranking
            .all()
        )

        if not chunks_query:
            return []

        results = []
        sem_weight = settings.HYBRID_SEARCH_SEMANTIC_WEIGHT  # 0.70
        lex_weight = settings.HYBRID_SEARCH_LEXICAL_WEIGHT   # 0.30

        query_words = set(query_text.lower().split())

        for chunk, doc in chunks_query:
            # Semantic Similarity (Cosine)
            sem_score = 0.5
            if query_vec and chunk.embedding is not None:
                try:
                    # Cosine distance to similarity: 1 - cosine_distance
                    # If vector is unit-normalized, dot product == cosine similarity
                    dot_prod = sum(a * b for a, b in zip(query_vec, chunk.embedding))
                    sem_score = max(0.0, min(1.0, (dot_prod + 1.0) / 2.0))
                except Exception:
                    sem_score = 0.5

            # Lexical Keyword Match
            content_lower = chunk.content.lower()
            title_lower = doc.title.lower()
            matched_words = sum(1 for w in query_words if w in content_lower or w in title_lower)
            lex_score = min(1.0, matched_words / max(1, len(query_words)))

            # Combined Hybrid Score
            raw_score = (sem_score * sem_weight) + (lex_score * lex_weight)

            # Apply Authority Level Boost
            auth_boost = AUTHORITY_BOOST_MAP.get(doc.authority_level, 1.0)
            final_score = round(min(1.0, raw_score * auth_boost), 4)

            results.append(
                HybridRetrievalResult(
                    chunk_id=chunk.id,
                    knowledge_document_id=doc.id,
                    knowledge_version_id=chunk.knowledge_version_id,
                    title=doc.title,
                    content=chunk.content,
                    final_score=final_score,
                    semantic_score=round(sem_score, 4),
                    lexical_score=round(lex_score, 4),
                    authority_level=doc.authority_level.value,
                    knowledge_type=doc.knowledge_type.value,
                    source_metadata=chunk.source_metadata,
                    created_at=doc.created_at.isoformat() if doc.created_at else "",
                )
            )

        # Sort by final_score descending
        results.sort(key=lambda r: r.final_score, reverse=True)
        return results[:top_k]

hybrid_retrieval_service = HybridRetrievalService()
