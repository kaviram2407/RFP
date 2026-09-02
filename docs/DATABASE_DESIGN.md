# Database Design & Schema Specification

## Core Tables

### Organization & Multi-Tenancy
- `organization` (id, name, slug, created_at, updated_at)
- `user` (id, organization_id, email, password_hash, full_name, role, created_at, updated_at)

### RFP Project Management (Phase 3)
- `rfp_project` (id, organization_id, created_by_id, name, reference_number, status, created_at, updated_at)

### RFP Documents & Processing (Phase 4 & Phase 5)
- `rfp_document` (id, organization_id, rfp_project_id, created_by_id, name, document_type, status, current_version_id)
- `document_version` (id, organization_id, rfp_document_id, version_number, original_filename, storage_key, content_type, file_size_bytes, checksum_sha256, processing_status, extraction_status)
- `document_content` (id, organization_id, document_version_id, full_text, character_count, source_unit_count)
- `document_content_block` (id, organization_id, document_content_id, document_version_id, sequence_number, source_type, source_index, text, metadata_json)

### Requirement Extraction & Evidence (Phase 6)
- `requirement` (id, organization_id, rfp_project_id, document_version_id, requirement_code, title, description, category, requirement_type, priority, mandatory, confidence_score, status, review_required)
- `requirement_evidence` (id, organization_id, requirement_id, document_version_id, content_block_id, evidence_text, source_type, source_reference, relevance_score)

### Company Knowledge & Hybrid RAG Retrieval (Phase 7)
- `company_knowledge_document` (id, organization_id, created_by_id, title, description, knowledge_type, source_name, source_reference, status, authority_level, effective_from, effective_until, created_at, updated_at, archived_at)
- `knowledge_document_version` (id, organization_id, knowledge_document_id, version_number, original_filename, content_type, storage_key, checksum_sha256, raw_content, processing_status)
- `knowledge_chunk` (id, organization_id, knowledge_document_id, knowledge_version_id, chunk_index, content, token_count, character_count, source_metadata, content_hash, embedding `vector(2048)`, embedding_model, embedding_dimensions, search_vector `tsvector`)

### Previous Proposal Intelligence & Historical Retrieval (Phase 8)
- `previous_proposal` (id, organization_id, created_by_id, title, proposal_reference, customer_name, description, proposal_date, submission_date, outcome `proposaloutcomeenum`, status `proposalstatusenum`, created_at, updated_at, archived_at)
- `previous_proposal_version` (id, organization_id, previous_proposal_id, version_number, original_filename, content_type, storage_key, checksum_sha256, raw_content, processing_status)
- `previous_proposal_section` (id, organization_id, proposal_id, proposal_version_id, section_index, section_title, content, character_count, source_metadata, content_hash, embedding `vector(2048)`, embedding_model, embedding_dimensions, search_vector `tsvector`)
