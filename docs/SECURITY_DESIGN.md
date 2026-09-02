# Security Design

## Tenant Isolation & Authorization
- Server-side authorization derives `organization_id` and `user_id` strictly from JWT bearer token context. Client-provided tenant overrides are ignored.
- Cross-tenant queries return `404 Not Found` or empty result sets to prevent leaking resource existence.

## Role-Based Access Control (RBAC)
- **`PRODUCT_TEAM`**: Full write permissions (Create RFP, Update, Archive, Upload Document, Trigger Processing, Trigger Requirement Extraction, Review Status, Create/Update Company Knowledge, Create/Update Previous Proposals).
- **`VP`, `CTO`, `CEO`**: Read and search access (List RFPs, View RFPs, List Documents, Download Documents, View Requirements, Search Company Knowledge Base, Search Previous Proposal Repository).

## Source Authority & RAG Controls
- Source Hierarchy Rule: Previous proposals are treated as historical evidence (`HISTORICAL PROPOSAL`) and cannot override current company knowledge (`AUTHORITATIVE`).
- Multi-tenant vector retrieval: `PreviousProposalSection` vector search strictly filters `organization_id == current_user.organization_id` at database query time.
- Status controls: Proposals with `DRAFT` or `ARCHIVED` status are strictly excluded from production search.
- Secret handling: API keys (`NVIDIA_API_KEY`, `JWT_SECRET_KEY`) are stored in environment variables and never logged or exposed in client responses.
