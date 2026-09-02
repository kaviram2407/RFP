# System Architecture

## Core Technology Stack
- **Frontend**: Next.js 16 (React, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11+, SQLAlchemy 2.x, Alembic)
- **Database**: PostgreSQL with `pgvector` extension
- **Storage**: Cloudflare R2 (S3-compatible API via `boto3`)
- **Caching & Workers**: Redis & Celery
- **Document Parsers**: PyMuPDF (`fitz`), `python-docx`, `openpyxl`, `python-pptx`
- **LLM Engine**: NVIDIA NIM OpenAI-compatible Chat Completions API (`openai/gpt-oss-120b`)
- **Embedding Engine**: NVIDIA NIM Embeddings API (`nvidia/nemotron-3-embed-1b`, 2048 dimensions)

## Hybrid RAG & Historical Retrieval Architecture (Phase 7 & Phase 8)
- **Company Knowledge Base (Phase 7)**: Represents current organization truth (`AUTHORITATIVE`: 1.2x boost, `APPROVED`: 1.1x boost).
- **Previous Proposal Intelligence Engine (Phase 8)**: Represents historical submitted proposals (`WON`, `LOST`, `NO_DECISION`, `UNKNOWN`).
- **Source Hierarchy Rule**:
  1. Current Authoritative Company Knowledge
  2. Current Approved Company Knowledge
  3. Recent Approved Proposals
  4. Older Approved Proposals
  5. Unsupported inference
- **Hybrid Search Engine**:
  - `Semantic Similarity`: Cosine Distance (`<->`) on 2048-dim vectors (`PreviousProposalSection.embedding`).
  - `Lexical Search`: PostgreSQL `ts_rank_cd` full-text search (`search_vector`).
  - `Recency Signal`: Exponential decay `exp(-age_days / 365.0)` derived from proposal date.
  - `Outcome Signal`: `WON` (+10% boost), `LOST` (0.95x, searchable).
  - `Status Controls`: `DRAFT` and `ARCHIVED` proposals are strictly excluded from production search.
