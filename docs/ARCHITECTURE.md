# System Architecture

## Core Technology Stack
- **Frontend**: Next.js 16 (React, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11+, SQLAlchemy 2.x, Alembic)
- **Database**: PostgreSQL with `pgvector` extension
- **Storage**: Cloudflare R2 (S3-compatible API via `boto3`)
- **Caching & Workers**: Redis & Celery

## Document Storage Architecture (Phase 4)
- **Tenant Isolation**: Every `RFPDocument` and `DocumentVersion` belongs to an `Organization`. Access is restricted at the API dependency layer.
- **Storage Key Format**: Objects are stored in R2 as `organizations/{org_id}/rfp-projects/{project_id}/documents/{doc_id}/versions/{version_id}` using server-generated UUIDs.
- **Security**: Uploaded files are validated for size (50MB default limit), extension (`.pdf`, `.docx`, `.xlsx`, `.pptx`), and magic byte headers (`%PDF-`, Zip headers `PK\x03\x04`). Downloads are served via short-lived presigned S3/R2 URLs.
