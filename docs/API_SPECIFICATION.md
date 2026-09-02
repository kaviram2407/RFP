# API Specification

## Authentication (`/auth`)
- `POST /auth/login`: Authenticate email/password via Argon2, returns JWT bearer token.
- `GET /auth/me`: Get current user info.

## RFP Projects (`/api/v1/rfp-projects`)
- `POST /api/v1/rfp-projects`: Create project (`PRODUCT_TEAM` only).
- `GET /api/v1/rfp-projects`: List projects for tenant.
- `GET /api/v1/rfp-projects/{id}`: Get project details.
- `PATCH /api/v1/rfp-projects/{id}`: Update project metadata / status (`PRODUCT_TEAM` only).
- `POST /api/v1/rfp-projects/{id}/archive`: Soft archive project (`PRODUCT_TEAM` only).

## RFP Documents (`/api/v1/rfp-projects/{project_id}/documents`)
- `POST /api/v1/rfp-projects/{project_id}/documents`: Upload file / Version 1 (`PRODUCT_TEAM` only).
- `POST /api/v1/rfp-projects/{project_id}/documents/{doc_id}/versions`: Upload Version N (`PRODUCT_TEAM` only).
- `GET /api/v1/rfp-projects/{project_id}/documents`: List documents.
- `GET /api/v1/rfp-projects/{project_id}/documents/{doc_id}`: Get document details.
- `GET /api/v1/rfp-projects/{project_id}/documents/{doc_id}/versions`: Get document version history.
- `GET /api/v1/rfp-projects/{project_id}/documents/{doc_id}/download`: Get short-lived presigned download URL.
- `POST /api/v1/rfp-projects/{project_id}/documents/{doc_id}/archive`: Soft archive document (`PRODUCT_TEAM` only).

## Document Processing (`/api/v1/rfp-projects/{project_id}/documents/{doc_id}/versions/{version_id}`)
- `GET .../processing`: Get processing status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- `POST .../process`: Trigger or retry document text extraction (`PRODUCT_TEAM` only).
- `GET .../content`: Retrieve extracted full text and structural blocks (`PAGE`, `PARAGRAPH`, `SHEET`, `SLIDE`).

## Requirement Extraction (`/api/v1/rfp-projects/{project_id}`)
- `POST .../requirement-extraction`: Trigger AI requirement extraction (`PRODUCT_TEAM` only).
- `GET .../requirement-extraction`: Check extraction status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- `GET .../requirements`: List requirements with pagination & category/priority/status filters.
- `GET .../requirements/{requirement_id}`: Get single requirement details with linked evidence list.
- `GET .../requirements/{requirement_id}/evidence`: List linked source evidence blocks.
- `PATCH .../requirements/{requirement_id}`: Human-in-the-loop review actions (`ACCEPTED`, `REJECTED`, edit fields) (`PRODUCT_TEAM` only).

## Company Knowledge & Hybrid RAG Retrieval (`/api/v1/company-knowledge` & `/api/v1/knowledge`)
- `POST /api/v1/company-knowledge`: Create knowledge document (`PRODUCT_TEAM` only).
- `GET /api/v1/company-knowledge`: List company knowledge documents with type/status/authority filters.
- `GET /api/v1/company-knowledge/{id}`: View knowledge document details & versions.
- `POST /api/v1/company-knowledge/{id}/versions`: Add new version (`PRODUCT_TEAM` only).
- `POST /api/v1/company-knowledge/{id}/versions/{version_id}/process`: Trigger ingestion & vector embedding task (`PRODUCT_TEAM` only).
- `PATCH /api/v1/company-knowledge/{id}`: Update metadata or status (`DRAFT`, `ACTIVE`, `ARCHIVED`) (`PRODUCT_TEAM` only).
- `POST /api/v1/knowledge/search`: Perform Hybrid RAG Search query across active company knowledge.
- `POST /api/v1/rfp-projects/{project_id}/requirements/{requirement_id}/find-evidence`: Find relevant company knowledge evidence for an RFP requirement.
