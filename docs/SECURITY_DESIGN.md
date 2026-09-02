# Security Design

## Tenant Isolation & Authorization
- Server-side authorization derives `organization_id` and `user_id` strictly from JWT bearer token context. Client-provided tenant overrides are ignored.
- Cross-tenant queries return `404 Not Found` to prevent leaking resource existence.

## Role-Based Access Control (RBAC)
- **`PRODUCT_TEAM`**: Full write permissions (Create RFP, Update, Archive, Upload Document, Add Document Version).
- **`VP`, `CTO`, `CEO`**: Read-only access (List RFPs, View RFPs, List Documents, Download Documents via presigned URLs).

## Document Storage Security
- **Cloudflare R2 Bucket**: Private bucket access only.
- **Presigned URLs**: Short-lived presigned GET URLs generated only after authenticating user & verifying tenant permissions.
- **File Validation**: Strict multi-layer validation (Extension, MIME type, Magic Header Bytes, and Size limit).
- **Storage Keys**: Obfuscated UUID hierarchy prevents path traversal and overwrite vulnerabilities.
