# AI-RFP Workspace Rules

These are mandatory rules for the AI-RFP Intelligence & Proposal Platform workspace.

1.  **DO NOT** invent business requirements.
2.  **DO NOT** change the approved architecture without approval.
3.  **DO NOT** replace PostgreSQL with another database without approval.
4.  **DO NOT** replace the approved AI architecture without approval.
5.  **DO NOT** expose the complete company knowledge base to the LLM. The LLM must only receive retrieved context.
6.  **DO NOT** treat previous proposals as authoritative truth. Current approved company information takes precedence.
7.  **DO NOT** fabricate company capabilities. Identify gaps instead.
8.  **DO NOT** silently overwrite approved proposal versions.
9.  **DO NOT** bypass backend authorization. RBAC must be enforced on the backend.
10. **DO NOT** use fake metrics on dashboards.
11. **DO NOT** declare a feature complete without testing it.
12. **DO NOT** hide errors.
13. **DO NOT** make unnecessary architectural changes. Favor simple, maintainable solutions (modular monolith).
14. When requirements are ambiguous, identify the ambiguity instead of silently inventing behavior.

For every phase:
1. Understand requirements
2. Inspect existing implementation
3. Produce a plan
4. Identify risks
5. Implement
6. Run tests
7. Run the application
8. Verify behavior
9. Verify UI when applicable
10. Report results
