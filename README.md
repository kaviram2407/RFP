# AI-RFP Intelligence & Proposal Platform

This is the central repository for the AI-RFP Intelligence & Proposal Platform.

## Phases

The development is divided into phases as outlined in the PRODUCT_BLUEPRINT.md and DEVELOPMENT_ROADMAP.md.

Phase 0: Project foundation + architecture + rules.
Phase 1: Environment + Docker + PostgreSQL + pgvector + Redis
Phase 2: Authentication + RBAC
...

## Architecture Overview

*   **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui
*   **Backend**: Python, FastAPI
*   **Database**: PostgreSQL, pgvector, SQLAlchemy 2.x, Alembic
*   **AI**: NVIDIA-hosted openai/gpt-oss-120b, NVIDIA nemotron-3-embed-1b
*   **Background Jobs**: Celery, Redis
*   **Storage**: Cloudflare R2

## Getting Started

### Prerequisites

* Python 3.11+
* Docker and Docker Compose
* Git

### Start infrastructure

```bash
docker compose up -d
```

### Create virtual environment

```bash
cd backend
python3 -m venv .venv
```

### Install dependencies

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

### Run migrations

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### Start backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Health check

You can verify the backend is running and connected to services via the health check endpoint:

```bash
curl http://localhost:8000/health
```

### Authentication & Development Users

The API is secured using JWT Bearer tokens and role-based access control (RBAC).
To create a development user, use the provided script:

```bash
cd backend
source .venv/bin/activate
python scripts/create_dev_user.py --email dev@example.com --password password123 --org-name "Dev Org" --org-slug "dev-org" --role PRODUCT_TEAM
```

You can obtain an access token and check current user status:
```bash
curl -X POST http://localhost:8000/auth/login -d "username=dev@example.com&password=password123"
curl -H "Authorization: Bearer <token>" http://localhost:8000/auth/me
```

### RFP Projects API (`/api/v1/rfp-projects`)

The platform supports creating and managing RFP Projects tied strictly to the user's Organization.

#### Endpoints
- `POST /api/v1/rfp-projects`: Create project (`PRODUCT_TEAM` only).
- `GET /api/v1/rfp-projects`: List projects for organization (Paginated, optional `status` filter. Accessible by `PRODUCT_TEAM`, `VP`, `CTO`, `CEO`).
- `GET /api/v1/rfp-projects/{project_id}`: Retrieve project details.
- `PATCH /api/v1/rfp-projects/{project_id}`: Update project or advance status (`PRODUCT_TEAM` only).
- `POST /api/v1/rfp-projects/{project_id}/archive`: Soft archive project (`PRODUCT_TEAM` only).

#### Example usage
```bash
# Create Project
curl -X POST http://localhost:8000/api/v1/rfp-projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enterprise Analytics RFP",
    "reference_number": "RFP-2026-001",
    "customer_name": "Acme Corp"
  }'

# List Projects
curl -H "Authorization: Bearer <token>" "http://localhost:8000/api/v1/rfp-projects?page=1&page_size=20"
```

### RFP Documents API & Cloudflare R2 Storage (`/api/v1/rfp-projects/{project_id}/documents`)

Secure document storage foundation supporting file uploads (`.pdf`, `.docx`, `.xlsx`, `.pptx`), automatic versioning, magic byte signature validation, size limit checks, and presigned R2 download URLs.

#### Endpoints
- `POST /api/v1/rfp-projects/{project_id}/documents`: Upload document / Version 1 (`PRODUCT_TEAM` only).
- `POST /api/v1/rfp-projects/{project_id}/documents/{document_id}/versions`: Upload Version N (`PRODUCT_TEAM` only).
- `GET /api/v1/rfp-projects/{project_id}/documents`: List documents for project (Paginated).
- `GET /api/v1/rfp-projects/{project_id}/documents/{document_id}`: Retrieve document details & current version.
- `GET /api/v1/rfp-projects/{project_id}/documents/{document_id}/versions`: List version history.
- `GET /api/v1/rfp-projects/{project_id}/documents/{document_id}/download`: Generate short-lived presigned R2 GET URL.
- `POST /api/v1/rfp-projects/{project_id}/documents/{document_id}/archive`: Soft archive document (`PRODUCT_TEAM` only).

### AI Requirement Extraction & Evidence Traceability API (`/api/v1/rfp-projects/{project_id}`)

AI-powered requirement extraction using NVIDIA NIM `openai/gpt-oss-120b` structured output, linking each requirement directly to Phase 5 source document content blocks (`PAGE`, `PARAGRAPH`, `SHEET`, `SLIDE`).

#### Extraction Lifecycle
- `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`

#### Endpoints
- `POST /api/v1/rfp-projects/{project_id}/requirement-extraction`: Trigger AI requirement extraction (`PRODUCT_TEAM` only).
- `GET /api/v1/rfp-projects/{project_id}/requirement-extraction`: Check extraction status.
- `GET /api/v1/rfp-projects/{project_id}/requirements`: List project requirements with category, type, priority, and status filters.
- `GET /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}`: View single requirement details.
- `GET /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}/evidence`: List linked source evidence blocks.
- `PATCH /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}`: Human-in-the-loop review actions (`ACCEPTED`, `REJECTED`, edit fields) (`PRODUCT_TEAM` only).

### Company Knowledge Base & Hybrid RAG API (`/api/v1/company-knowledge` & `/api/v1/knowledge/search`)

Hybrid RAG retrieval engine combining Cosine Similarity over NVIDIA Nemotron 2048-dim embeddings (`pgvector`) with PostgreSQL Full-Text Search and Authority Boosting.

#### Endpoints
- `POST /api/v1/company-knowledge`: Create Company Knowledge document (`PRODUCT_TEAM` only).
- `GET /api/v1/company-knowledge`: List company knowledge documents with filters.
- `GET /api/v1/company-knowledge/{id}`: View knowledge document details & versions.
- `POST /api/v1/company-knowledge/{id}/versions`: Add new knowledge version (`PRODUCT_TEAM` only).
- `POST /api/v1/company-knowledge/{id}/versions/{version_id}/process`: Trigger chunking & embedding pipeline (`PRODUCT_TEAM` only).
- `PATCH /api/v1/company-knowledge/{id}`: Update metadata or status (`DRAFT`, `ACTIVE`, `ARCHIVED`) (`PRODUCT_TEAM` only).
- `POST /api/v1/knowledge/search`: Perform Hybrid RAG Search query across active company knowledge.
- `POST /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}/find-evidence`: Find relevant company knowledge evidence for an RFP requirement.

### Previous Proposals & Historical Retrieval API (`/api/v1/previous-proposals`)

Hybrid historical proposal retrieval engine combining Cosine Distance over 2048-dim NVIDIA embeddings (`pgvector`) with PostgreSQL Full-Text Search, recency decay, and outcome signals (`WON`, `LOST`).

#### Endpoints
- `POST /api/v1/previous-proposals`: Create previous proposal (`PRODUCT_TEAM` only).
- `GET /api/v1/previous-proposals`: List previous proposals with outcome/status filters.
- `GET /api/v1/previous-proposals/{id}`: View proposal details & versions.
- `POST /api/v1/previous-proposals/{id}/versions`: Add proposal version (`PRODUCT_TEAM` only).
- `POST /api/v1/previous-proposals/{id}/versions/{version_id}/process`: Trigger ingestion & vector processing (`PRODUCT_TEAM` only).
- `PATCH /api/v1/previous-proposals/{id}`: Update metadata or status (`DRAFT`, `APPROVED`, `ARCHIVED`) (`PRODUCT_TEAM` only).
- `POST /api/v1/previous-proposals/search`: Historical Proposal Search API.
- `POST /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}/find-previous-proposals`: Find historical proposal evidence for an RFP requirement.

### Running Tests
To verify authentication, RBAC, tenant isolation, RFP Project lifecycles, Cloudflare R2 Uploads, Document Processing, Requirement Extraction, Hybrid RAG Search, and Previous Proposal Historical Search:
```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests
```







### Stop infrastructure

```bash
docker compose down
```

