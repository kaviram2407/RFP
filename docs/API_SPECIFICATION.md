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
