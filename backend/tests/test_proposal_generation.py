import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import uuid
from datetime import datetime, timezone

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.rfp_document import RFPDocument, DocumentVersion, DocumentTypeEnum
from app.models.requirement import Requirement, RequirementCategoryEnum, RequirementTypeEnum, RequirementPriorityEnum
from app.models.proposal import (
    Proposal,
    ProposalVersion,
    ProposalSection,
    ProposalStatusEnum,
    GenerationStatusEnum,
    SectionReviewStatusEnum,
)
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture
def proposal_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    org_a = Organization(id=uuid.uuid4(), name="Org A", slug="org-a")
    org_b = Organization(id=uuid.uuid4(), name="Org B", slug="org-b")
    db.add_all([org_a, org_b])
    db.commit()

    user_prod = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="prod_prop@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.PRODUCT_TEAM,
        full_name="Product User",
        is_active=True
    )
    user_vp = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="vp_prop@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.VP,
        full_name="VP User",
        is_active=True
    )
    user_org_b = User(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        email="user_prop@orgb.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.PRODUCT_TEAM,
        full_name="B User",
        is_active=True
    )
    db.add_all([user_prod, user_vp, user_org_b])
    db.commit()

    project = RFPProject(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        name="Proposal Gen Test Project",
        reference_number="REF-PROP-100",
        customer_name="Enterprise Corp",
        status="ACTIVE",
        created_by_id=user_prod.id
    )
    db.add(project)
    db.commit()

    doc = RFPDocument(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project.id,
        name="Test RFP.pdf",
        document_type=DocumentTypeEnum.PDF,
        created_by_id=user_prod.id
    )
    db.add(doc)
    db.commit()

    doc_ver = DocumentVersion(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_document_id=doc.id,
        version_number=1,
        original_filename="Test RFP.pdf",
        storage_key="docs/test.pdf",
        content_type="application/pdf",
        file_size_bytes=1000,
        checksum_sha256="abc",
        created_by_id=user_prod.id
    )
    db.add(doc_ver)
    db.commit()

    req = Requirement(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project.id,
        document_version_id=doc_ver.id,
        requirement_code="REQ-SEC-001",
        title="SAML 2.0 Single Sign-On Integration",
        description="The system must support SAML 2.0 SSO with MFA.",
        category=RequirementCategoryEnum.SECURITY,
        requirement_type=RequirementTypeEnum.MANDATORY,
        priority=RequirementPriorityEnum.CRITICAL,
        mandatory=True,
        confidence_score=0.95
    )
    db.add(req)
    db.commit()

    yield {
        "db": db,
        "org_a": org_a,
        "org_b": org_b,
        "user_prod": user_prod,
        "user_vp": user_vp,
        "user_org_b": user_org_b,
        "project": project,
        "requirement": req
    }

def get_auth_headers(client: TestClient, email: str, password: str = "password123"):
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_proposal_generation_lifecycle_and_rbac(proposal_db):
    client = TestClient(app)

    prod_headers = get_auth_headers(client, "prod_prop@orga.com")
    vp_headers = get_auth_headers(client, "vp_prop@orga.com")
    org_b_headers = get_auth_headers(client, "user_prop@orgb.com")

    project_id = str(proposal_db["project"].id)

    # 1. Create Proposal as Product Team
    create_resp = client.post(
        f"/api/v1/rfp-projects/{project_id}/proposals",
        json={"title": "Phase 10 Enterprise Proposal", "description": "AI Generated Proposal"},
        headers=prod_headers
    )
    assert create_resp.status_code == 201, create_resp.text
    prop_data = create_resp.json()
    proposal_id = prop_data["id"]
    version_id = prop_data["current_version_id"]
    sections = prop_data["current_version"]["sections"]
    assert len(sections) == 8

    # 2. List Proposals
    list_resp = client.get(f"/api/v1/rfp-projects/{project_id}/proposals", headers=prod_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # 3. Retrieve Single Proposal
    get_resp = client.get(f"/api/v1/proposals/{proposal_id}", headers=prod_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == proposal_id

    # 4. Generate Single Section
    sec_id = sections[0]["id"]
    gen_resp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}/generate",
        headers=prod_headers
    )
    assert gen_resp.status_code == 200, gen_resp.text
    sec_data = gen_resp.json()
    assert sec_data["generation_status"] == "COMPLETED"
    assert len(sec_data["content"]) > 0

    # 5. Get Evidence and Claims
    ev_resp = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}/evidence",
        headers=prod_headers
    )
    assert ev_resp.status_code == 200
    assert isinstance(ev_resp.json(), list)

    claims_resp = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}/claims",
        headers=prod_headers
    )
    assert claims_resp.status_code == 200
    assert isinstance(claims_resp.json(), list)

    # 6. Edit Section Content & Review Status
    edit_resp = client.patch(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}",
        json={"content": "## Custom Edited Content\n\nVerified.", "review_status": "APPROVED"},
        headers=prod_headers
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["content"] == "## Custom Edited Content\n\nVerified."
    assert edit_resp.json()["review_status"] == "APPROVED"

    # 7. Create New Proposal Version
    ver_resp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions",
        json={"copy_from_version_id": version_id},
        headers=prod_headers
    )
    assert ver_resp.status_code == 201
    new_ver = ver_resp.json()
    assert new_ver["version_number"] == 2
    assert len(new_ver["sections"]) == 8

    # 8. List Versions
    ver_list_resp = client.get(f"/api/v1/proposals/{proposal_id}/versions", headers=prod_headers)
    assert ver_list_resp.status_code == 200
    assert len(ver_list_resp.json()) == 2

    # 9. RBAC Verification (VP cannot create/generate)
    vp_create = client.post(
        f"/api/v1/rfp-projects/{project_id}/proposals",
        json={"title": "VP Proposal"},
        headers=vp_headers
    )
    assert vp_create.status_code == 403

    vp_gen = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}/generate",
        headers=vp_headers
    )
    assert vp_gen.status_code == 403

    # VP can view
    vp_view = client.get(f"/api/v1/proposals/{proposal_id}", headers=vp_headers)
    assert vp_view.status_code == 200

    # 10. Tenant Isolation (Org B gets 404)
    org_b_view = client.get(f"/api/v1/proposals/{proposal_id}", headers=org_b_headers)
    assert org_b_view.status_code == 404

def test_unsupported_claim_verification(proposal_db):
    """Item 2: Anti-hallucination & unsupported claim detection/persistence."""
    from app.services.proposal_generation import proposal_generation_service
    from app.models.proposal import UnsupportedClaim, GeneratedContentEvidence

    db = proposal_db["db"]
    org_id = proposal_db["org_a"].id
    project_id = proposal_db["project"].id
    user_id = proposal_db["user_prod"].id

    # Create proposal & section for unsupported capability test
    prop = Proposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        rfp_project_id=project_id,
        title="Unsupported Claim Test Proposal",
        status=ProposalStatusEnum.DRAFT,
        created_by_id=user_id
    )
    db.add(prop)
    db.commit()

    ver = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        version_number=1,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=user_id
    )
    db.add(ver)
    db.commit()

    sec = ProposalSection(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        proposal_version_id=ver.id,
        section_key="quantum_encryption",
        section_title="Quantum Resistance & Exotic Security Capabilities",
        section_order=1,
        content="",
        status=ProposalStatusEnum.DRAFT
    )
    db.add(sec)
    db.commit()

    # Generate section where company evidence does NOT support the capability
    res_sec = proposal_generation_service.generate_section(db, sec.id, org_id)

    # Verify anti-hallucination behavior
    assert res_sec.generation_status == GenerationStatusEnum.COMPLETED
    assert res_sec.review_required is True

    claims = db.query(UnsupportedClaim).filter(UnsupportedClaim.proposal_section_id == sec.id).all()
    assert len(claims) >= 1
    assert claims[0].review_required is True
    assert claims[0].claim is not None
    assert claims[0].reason is not None

def test_evidence_id_validation(proposal_db):
    """Item 3: Validate model-generated evidence IDs against actual database/retrieved records."""
    from app.services.proposal_generation import proposal_generation_service
    from app.schemas.proposal import LLMSectionOutputSchema
    from app.models.proposal import GeneratedContentEvidence
    from unittest.mock import patch

    db = proposal_db["db"]
    org_id = proposal_db["org_a"].id
    project_id = proposal_db["project"].id
    user_id = proposal_db["user_prod"].id

    prop = Proposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        rfp_project_id=project_id,
        title="Evidence Validation Test Proposal",
        status=ProposalStatusEnum.DRAFT,
        created_by_id=user_id
    )
    db.add(prop)
    db.commit()

    ver = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        version_number=1,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=user_id
    )
    db.add(ver)
    db.commit()

    sec = ProposalSection(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        proposal_version_id=ver.id,
        section_key="sec_evidence_test",
        section_title="Security Architecture Test",
        section_order=1,
        content="",
        status=ProposalStatusEnum.DRAFT
    )
    db.add(sec)
    db.commit()

    fake_invalid_id = str(uuid.uuid4())
    mock_llm_output = {
        "section_title": "Security Architecture Test",
        "section_content": "## Security Architecture\n\nFabricated claims with bad ID.",
        "confidence_score": 0.85,
        "review_required": False,
        "key_claims": [],
        "evidence": [
            {
                "source_type": "COMPANY_KNOWLEDGE",
                "source_id": fake_invalid_id,  # Invalid/unretrieved source ID
                "source_title": "Fabricated Doc",
                "citation_reference": "Ref 123",
                "evidence_text": "Fabricated text quote",
                "relevance_score": 0.9,
                "authority_level": "AUTHORITATIVE",
                "is_conflicting": False,
                "conflict_notes": None
            }
        ],
        "unsupported_claims": [],
        "assumptions": []
    }

    with patch("app.services.llm_client.nvidia_llm_client.generate_proposal_section_llm", return_value=mock_llm_output):
        res_sec = proposal_generation_service.generate_section(db, sec.id, org_id)

    ev_records = db.query(GeneratedContentEvidence).filter(GeneratedContentEvidence.proposal_section_id == sec.id).all()
    assert len(ev_records) == 1
    # Invalid ID rejected & demoted
    assert ev_records[0].source_id is None
    assert ev_records[0].authority_level == "UNSUPPORTED"
    assert res_sec.review_required is True

def test_source_hierarchy_verification(proposal_db):
    """Item 4: Verify current authoritative company knowledge > previous proposal content rule."""
    from app.services.proposal_generation import PROPOSAL_GENERATION_SYSTEM_PROMPT

    # Confirm system prompt contains strict source hierarchy rules
    assert "1st Priority (Authoritative): Current Company Knowledge Base Documents." in PROPOSAL_GENERATION_SYSTEM_PROMPT
    assert "2nd Priority (Historical Reference): Previous Proposal Sections." in PROPOSAL_GENERATION_SYSTEM_PROMPT
    assert "3rd Priority: Current RFP Requirements & Evidence." in PROPOSAL_GENERATION_SYSTEM_PROMPT
    assert "If current authoritative company knowledge conflicts with a previous proposal claim, current company knowledge strictly prevails." in PROPOSAL_GENERATION_SYSTEM_PROMPT

def test_version_preservation_and_regeneration(proposal_db):
    """Item 6: Verify version preservation during section regeneration (v1 preserved, v2 updated)."""
    from app.services.proposal_generation import proposal_generation_service

    db = proposal_db["db"]
    org_id = proposal_db["org_a"].id
    project_id = proposal_db["project"].id
    user_id = proposal_db["user_prod"].id

    # Create Proposal & Version 1
    prop = Proposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        rfp_project_id=project_id,
        title="Version Preservation Proposal",
        status=ProposalStatusEnum.DRAFT,
        created_by_id=user_id
    )
    db.add(prop)
    db.commit()

    ver1 = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        version_number=1,
        status=ProposalStatusEnum.GENERATED,
        generation_status=GenerationStatusEnum.COMPLETED,
        created_by_id=user_id
    )
    db.add(ver1)
    db.commit()

    sec1 = ProposalSection(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        proposal_version_id=ver1.id,
        section_key="exec_summary",
        section_title="1. Executive Summary",
        section_order=1,
        content="Version 1 Original Content for Exec Summary",
        ai_generated_content="Version 1 Original Content for Exec Summary",
        status=ProposalStatusEnum.GENERATED,
        generation_status=GenerationStatusEnum.COMPLETED
    )
    db.add(sec1)
    db.commit()

    # Create Version 2 by copying Version 1
    ver2 = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        version_number=2,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=user_id
    )
    db.add(ver2)
    db.commit()

    sec2 = ProposalSection(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        proposal_version_id=ver2.id,
        section_key="exec_summary",
        section_title="1. Executive Summary",
        section_order=1,
        content="Version 1 Original Content for Exec Summary",
        ai_generated_content="Version 1 Original Content for Exec Summary",
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING
    )
    db.add(sec2)
    db.commit()

    # Regenerate Section A in Version 2
    res_sec2 = proposal_generation_service.generate_section(db, sec2.id, org_id)

    # Refresh Version 1 Section
    db.refresh(sec1)

    # Confirm Version 1 remains unchanged & retrievable
    assert sec1.content == "Version 1 Original Content for Exec Summary"
    assert sec1.proposal_version_id == ver1.id

    # Confirm Version 2 contains the regenerated content
    assert res_sec2.content != "Version 1 Original Content for Exec Summary"
    assert res_sec2.proposal_version_id == ver2.id
    assert res_sec2.generation_status == GenerationStatusEnum.COMPLETED

def test_nvidia_error_handling(proposal_db):
    """Item 7: Verify NVIDIA client error handling (no fake proposal on auth failure, FAILED status on error)."""
    from app.services.llm_client import nvidia_llm_client
    from app.services.proposal_generation import proposal_generation_service
    import httpx
    from unittest.mock import patch, MagicMock
    from fastapi import HTTPException

    # Confirm approved model configuration
    assert nvidia_llm_client.model == "nvidia/nemotron-3-super-120b-a12b"

    # Test genuine HTTP 401 Auth error raises 502 Bad Gateway exception
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = '{"detail": "Invalid API Key"}'
    err = httpx.HTTPStatusError("401 Unauthorized", request=MagicMock(), response=mock_resp)

    with patch("httpx.Client.post", side_effect=err):
        with pytest.raises(HTTPException) as exc_info:
            nvidia_llm_client.generate_proposal_section_llm(
                system_prompt="Test",
                user_content="Test",
                fallback_section_title="Test Section"
            )
        assert exc_info.value.status_code == 502
        assert "NVIDIA NIM LLM proposal generation failed" in exc_info.value.detail

    # Test section generation failure sets section status to FAILED
    db = proposal_db["db"]
    org_id = proposal_db["org_a"].id
    project_id = proposal_db["project"].id
    user_id = proposal_db["user_prod"].id

    prop = Proposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        rfp_project_id=project_id,
        title="NVIDIA Error Test Proposal",
        status=ProposalStatusEnum.DRAFT,
        created_by_id=user_id
    )
    db.add(prop)
    db.commit()

    ver = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        version_number=1,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=user_id
    )
    db.add(ver)
    db.commit()

    sec = ProposalSection(
        id=uuid.uuid4(),
        organization_id=org_id,
        proposal_id=prop.id,
        proposal_version_id=ver.id,
        section_key="err_section",
        section_title="Error Section",
        section_order=1,
        content="",
        status=ProposalStatusEnum.DRAFT
    )
    db.add(sec)
    db.commit()

    with patch("app.services.proposal_generation.nvidia_llm_client.generate_proposal_section_llm", side_effect=RuntimeError("Simulated LLM failure")):
        with pytest.raises(RuntimeError):
            proposal_generation_service.generate_section(db, sec.id, org_id)

    db.refresh(sec)
    assert sec.generation_status == GenerationStatusEnum.FAILED
    assert sec.status == ProposalStatusEnum.DRAFT

