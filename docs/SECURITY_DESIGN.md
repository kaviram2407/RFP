# Security Design

## Tenant Isolation & Authorization
- Server-side authorization derives `organization_id` and `user_id` strictly from JWT bearer token context. Client-provided tenant overrides are ignored.
- Cross-tenant queries return `404 Not Found` to prevent leaking resource existence.

## Role-Based Access Control (RBAC)
- **`PRODUCT_TEAM`**: Full write permissions (Create RFP, Update, Archive, Upload Document, Add Document Version, Trigger Document Reprocessing).
- **`VP`, `CTO`, `CEO`**: Read-only access (List RFPs, View RFPs, List Documents, Download Documents, View Processing Status, View Extracted Content).

## Untrusted Input & Document Processing Security
- Extracted document text is treated strictly as plain data and is never executed or interpreted as code/instructions.
- External macros, dynamic formulas, and embedded scripts are not executed by the extraction layer.
- Workers download files directly from R2 using backend credentials within the tenant boundaries.
