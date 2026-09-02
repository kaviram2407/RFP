# Security Design

## Tenant Isolation & Authorization
- Server-side authorization derives `organization_id` and `user_id` strictly from JWT bearer token context. Client-provided tenant overrides are ignored.
- Cross-tenant queries return `404 Not Found` to prevent leaking resource existence.

## Role-Based Access Control (RBAC)
- **`PRODUCT_TEAM`**: Full write permissions (Create RFP, Update, Archive, Upload Document, Add Document Version, Trigger Document Processing, Trigger Requirement Extraction, Review/Update Requirement Status).
- **`VP`, `CTO`, `CEO`**: Read-only access (List RFPs, View RFPs, List Documents, Download Documents, View Processing Status, View Requirements, View Source Evidence).

## Untrusted Input & Prompt Injection Protection
- Extracted RFP document text is treated strictly as plain data and is never executed or interpreted as system instructions.
- The LLM prompt architecture explicitly separates `SYSTEM INSTRUCTIONS` from `UNTRUSTED RFP CONTENT`.
- Prompt injection attempts embedded inside RFP text (e.g. "Ignore previous instructions...") are parsed strictly as untrusted text and cannot hijack the extraction pipeline.

## Hallucination Rejection & Evidence Verification
- Model-generated block IDs are strictly validated against database `DocumentContentBlock` records.
- Unmatched, fake, or cross-tenant block IDs returned by the model are rejected.
- Authoritative evidence text is populated directly from database records rather than trusting model outputs.
