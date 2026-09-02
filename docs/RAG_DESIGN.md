# RAG Architecture & Hybrid Retrieval Engine Design

## Overview
Phase 7 & Phase 8 introduce the enterprise **Company Knowledge Base** (Phase 7) and **Previous Proposal Intelligence Engine** (Phase 8). The platform indexes organization-approved company documents and historical submitted proposals using NVIDIA NIM embeddings (`nvidia/nemotron-3-embed-1b`, 2048 dimensions) via `pgvector` and PostgreSQL full-text search (`tsvector`).

---

## 1. Vector Configuration & Embeddings
- **Model**: NVIDIA `nvidia/nemotron-3-embed-1b`
- **Dimensions**: **2048-dimensional float vectors** (stored via PostgreSQL `pgvector` `Vector(2048)`).
- **Endpoint**: NVIDIA NIM `/v1/embeddings` via `httpx` client.
- **Input Types**:
  - `input_type="passage"` for document chunk/section indexing.
  - `input_type="query"` for search query vectorization.

---

## 2. Source Authority Architecture Rule (Phase 8)
Previous proposals MUST NEVER automatically override current company knowledge. The system distinguishes:

### Current Company Truth (Phase 7)
- `AUTHORITATIVE` company knowledge (1.2x boost weight)
- `APPROVED` company knowledge (1.1x boost weight)
- Current approved policies and specifications.

### Historical Evidence (Phase 8)
- `APPROVED` previous proposals (`WON`, `LOST`, `NO_DECISION`, `UNKNOWN`)
- Explicitly labeled `HISTORICAL PROPOSAL` in API responses and UI components.
- Never automatically copied into new proposal drafts without human review.

---

## 3. Hybrid Search Strategy & Historical Ranking
The retrieval engine combines:
1. **Semantic Search**: Vector similarity via `pgvector` Cosine Distance (`<->`) on `PreviousProposalSection.embedding`.
2. **Lexical Full-Text Search**: Keyword relevance via PostgreSQL `ts_rank_cd(search_vector, plainto_tsquery('english', query))`.
3. **Recency Decay Signal**: `exp(-age_days / 365.0)` derived from proposal date.
4. **Outcome Signals**:
   - `WON`: **+10% boost**
   - `NO_DECISION` / `UNKNOWN`: **1.0x (neutral)**
   - `LOST`: **0.95x (searchable)**

---

## 4. Multi-Tenant Security & Status Controls
- **Tenant Isolation**: Every database query enforces `organization_id == current_user.organization_id` at query time.
- **Status Lifecycle**:
  - `DRAFT`: Excluded from production retrieval.
  - `APPROVED`: Eligible for historical search retrieval.
  - `ARCHIVED`: Excluded from production retrieval.
- **Role-Based Access Control (RBAC)**:
  - `PRODUCT_TEAM`: Full write access (Create previous proposals, add versions, trigger ingestion, update status).
  - `VP`, `CTO`, `CEO`: Read and search access.
