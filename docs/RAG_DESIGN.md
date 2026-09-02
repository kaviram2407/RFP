# RAG Architecture & Hybrid Retrieval Engine Design

## Overview
Phase 7 introduces the enterprise **Company Knowledge Base** and **Hybrid RAG Retrieval Engine**. The platform indexes organization-approved company documents (Security certifications, Support policies, Technical specifications, Product manuals) and retrieves ranked, authoritative evidence snippets for RFP requirements.

---

## 1. Vector Configuration & Embeddings
- **Model**: NVIDIA `nvidia/nemotron-3-embed-1b`
- **Dimensions**: **2048-dimensional float vectors** (stored via PostgreSQL `pgvector` `Vector(2048)`).
- **Endpoint**: NVIDIA NIM `/v1/embeddings` via `httpx` client.
- **Input Types**:
  - `input_type="passage"` for document chunk indexing.
  - `input_type="query"` for search query vectorization.

---

## 2. Document Chunking & Provenance
- **Chunker Engine**: `KnowledgeChunker` (`app/services/knowledge_chunker.py`).
- **Strategy**: Preserves structural metadata (`page`, `section`, `sheet`, `slide`) alongside chunk text.
- **Content Hash**: Computes SHA256 `content_hash` to guarantee chunk uniqueness and prevent duplicate indexing.

---

## 3. Hybrid Search Strategy
The retrieval engine combines:
1. **Semantic Search**: Vector similarity via `pgvector` Cosine Distance (`<->`) on `KnowledgeChunk.embedding`.
2. **Lexical Full-Text Search**: Keyword relevance via PostgreSQL `ts_rank_cd(search_vector, plainto_tsquery('english', query))`.

### Scoring & Authority Boosting Formula
```text
HybridScore = (SemanticSimilarity * 0.70) + (LexicalRank * 0.30)
FinalScore  = min(1.0, HybridScore * AuthorityBoost)
```

#### Authority Level Boost Weights:
- `AUTHORITATIVE`: **1.2x**
- `APPROVED`: **1.1x**
- `INTERNAL`: **1.0x**
- `REFERENCE`: **0.9x**

---

## 4. Multi-Tenant Security & Status Controls
- **Tenant Isolation**: Every database query enforces `organization_id == current_user.organization_id` at query time.
- **Status Lifecycle**:
  - `DRAFT`: Editable, excluded from production search.
  - `ACTIVE`: Eligible for retrieval.
  - `ARCHIVED`: Excluded from production search.
- **Role-Based Access Control (RBAC)**:
  - `PRODUCT_TEAM`: Full write access (Create knowledge documents, add versions, trigger ingestion, update status).
  - `VP`, `CTO`, `CEO`: Read and search access.

---

## 5. Future Extensions
Phase 8+ will introduce Previous Proposal Intelligence. In future RAG retrieval workflows, Company Knowledge chunks with `AUTHORITATIVE` level will outrank previous proposal content.
