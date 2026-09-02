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

## Hybrid RAG Retrieval Architecture (Phase 7)
- **Company Knowledge Document**: Represents approved organization knowledge (`title`, `knowledge_type`, `status` (`DRAFT`, `ACTIVE`, `ARCHIVED`), `authority_level` (`AUTHORITATIVE`, `APPROVED`, `INTERNAL`, `REFERENCE`)).
- **KnowledgeChunk**: Stores chunk text, `source_metadata` (`page`, `section`, `cell_range`), `content_hash`, `Vector(2048)` pgvector column, and PostgreSQL `TSVector` full-text search column.
- **Hybrid Retrieval Engine**:
  - `Semantic Similarity`: Cosine Distance (`<->`) on 2048-dim vectors.
  - `Lexical Search`: PostgreSQL `ts_rank_cd` full-text search.
  - `Hybrid Formula`: `(Semantic * 0.70) + (Lexical * 0.30)` multiplied by Authority Boost (`AUTHORITATIVE`: 1.2x).
  - `Status Controls`: `DRAFT` and `ARCHIVED` documents are strictly excluded from active search results.
