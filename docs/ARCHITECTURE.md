# System Architecture

## Core Technology Stack
- **Frontend**: Next.js 16 (React, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11+, SQLAlchemy 2.x, Alembic)
- **Database**: PostgreSQL with `pgvector` extension (Vector retrieval reserved for Phase 7+)
- **Storage**: Cloudflare R2 (S3-compatible API via `boto3`)
- **Caching & Workers**: Redis & Celery
- **Document Parsers**: PyMuPDF (`fitz`), `python-docx`, `openpyxl`, `python-pptx`
- **LLM Engine**: NVIDIA NIM OpenAI-compatible Chat Completions API (`openai/gpt-oss-120b`)

## Requirement Extraction Architecture (Phase 6)
- **Requirement Model**:
  - `Requirement`: Stores `title`, `description`, `category` (11 controlled categories), `requirement_type` (`MANDATORY`, `OPTIONAL`, `INFORMATIONAL`), `priority` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), `mandatory`, `confidence_score`, `status` (`EXTRACTED`, `REVIEW_REQUIRED`, `ACCEPTED`, `REJECTED`), `review_required`, and server-generated code (`REQ-0001`, `REQ-0002`).
  - `RequirementEvidence`: Links requirement directly to Phase 5 `DocumentContentBlock` (`PAGE 17`, `SHEET: Matrix`, `SLIDE 3`) and populates original authoritative RFP text directly from the database.
- **Asynchronous Worker Pipeline**: Celery task `extract_requirements_task` handles context windowing, LLM invocation, block ID verification, hallucination rejection, and database persistence.
- **Prompt Injection Isolation**: System prompt strictly separates system instructions from untrusted RFP text blocks.
- **Idempotent Processing**: Re-running requirement extraction cleanly replaces existing `Requirement` and `RequirementEvidence` records without duplicate DB rows.

> **Note**: Requirement extraction is AI-assisted and must not be treated as authoritative without human review where flagged (`review_required = True`).
