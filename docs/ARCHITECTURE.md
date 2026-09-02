# System Architecture

## Core Technology Stack
- **Frontend**: Next.js 16 (React, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11+, SQLAlchemy 2.x, Alembic)
- **Database**: PostgreSQL with `pgvector` extension
- **Storage**: Cloudflare R2 (S3-compatible API via `boto3`)
- **Caching & Workers**: Redis & Celery
- **Document Parsers**: PyMuPDF (`fitz`), `python-docx`, `openpyxl`, `python-pptx`

## Document Processing Architecture (Phase 5)
- **Extracted Content Hierarchy**:
  - `DocumentContent`: Holds aggregated normalized `full_text` and total unit count per version.
  - `DocumentContentBlock`: Stores granular blocks (`PAGE`, `PARAGRAPH`, `SHEET`, `SLIDE`) with 1-indexed numbers and positional JSON metadata (`bbox`, `sheet_name`, `slide_title`) preparing for Phase 6 evidence linking.
- **Asynchronous Worker Pipeline**: Celery task `process_document_version_task` handles retrieval from R2, parser selection, block extraction, text normalization, and database persistence.
- **Idempotent Retry**: Re-running processing on a `DocumentVersion` cleanly replaces old extraction output without generating duplicate DB rows.
