import pytest
from unittest.mock import patch, MagicMock
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
from app.models.rfp_document import RFPDocument, DocumentVersion, DocumentContent, DocumentContentBlock, DocumentTypeEnum, SourceTypeEnum
from app.models.requirement import Requirement, RequirementEvidence, RequirementCategoryEnum, RequirementTypeEnum, RequirementPriorityEnum
from app.models.company_knowledge import CompanyKnowledgeDocument, KnowledgeDocumentVersion, KnowledgeChunk
from app.models.previous_proposal import PreviousProposal, PreviousProposalVersion, PreviousProposalSection
from app.models.compliance import (
    ComplianceAssessment,
    ComplianceEvidence,
    GapAnalysis,
    RiskAnalysis,
    ComplianceStatusEnum,
    ReviewStatusEnum,
    RiskCategoryEnum,
    RiskSeverityEnum,
    GapSeverityEnum,
)
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture
def comp_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    org_a = Organization(id=uuid.uuid4(), name="Org A", slug="org-a")
    org_b = Organization(id=uuid.uuid4(), name="Org B", slug="org-b")
    db.add_all([org_a, org_b])
    db.commit()

    user_prod = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="prod@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.PRODUCT_TEAM,
        full_name="Product User",
        is_active=True
    )
    user_vp = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="vp@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.VP,
        full_name="VP User",
        is_active=True
    )
    user_org_b = User(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        email="user@orgb.com",
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
        name="Compliance Test Project",
        reference_number="REF-COMP-001",
        customer_name="Test Client",
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

    ver = DocumentVersion(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_document_id=doc.id,
        version_number=1,
        original_filename="Test_RFP.pdf",
        storage_key="key_123",
        content_type="application/pdf",
        file_size_bytes=1024,
        checksum_sha256="hash123",
        created_by_id=user_prod.id
    )
    db.add(ver)
    db.commit()

    doc_content = DocumentContent(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        document_version_id=ver.id,
        full_text="System must encrypt data at rest using AES-256.",
        character_count=48,
        source_unit_count=1
    )
    db.add(doc_content)
    db.commit()

    block = DocumentContentBlock(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        document_content_id=doc_content.id,
        document_version_id=ver.id,
        sequence_number=1,
        source_type=SourceTypeEnum.PAGE,
        source_index=1,
        text="System must encrypt data at rest using AES-256."
    )
    db.add(block)
    db.commit()

    req = Requirement(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project.id,
        document_version_id=ver.id,
        requirement_code="REQ-001",
        title="Data Encryption at Rest",
        description="System must support AES-256 encryption for data at rest.",
        category=RequirementCategoryEnum.SECURITY,
        requirement_type=RequirementTypeEnum.MANDATORY,
        priority=RequirementPriorityEnum.HIGH,
        mandatory=True,
        confidence_score=0.95
    )
    db.add(req)
    db.commit()

    req_ev = RequirementEvidence(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        requirement_id=req.id,
        document_version_id=ver.id,
        content_block_id=block.id,
        evidence_text="System must encrypt data at rest using AES-256.",
        source_reference="Page 1"
    )
    db.add(req_ev)
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

def get_token(client, email, password="password123"):
    res = client.post("/auth/login", data={"username": email, "password": password})
    return res.json()["access_token"]

def test_trigger_and_get_compliance_assessment(comp_db):
    client = TestClient(app)
    token = get_token(client, comp_db["user_prod"].email)
    headers = {"Authorization": f"Bearer {token}"}
    project_id = comp_db["project"].id
    req_id = comp_db["requirement"].id

    # Trigger compliance assessment
    res = client.post(f"/api/v1/rfp-projects/{project_id}/compliance-assessment", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "COMPLETED"

    # Get single requirement compliance details
    res = client.get(f"/api/v1/rfp-projects/{project_id}/requirements/{req_id}/compliance", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["requirement_id"] == str(req_id)
    assert "status" in data
    assert "evidence_list" in data
    assert "risk_analysis" in data

def test_list_compliance_assessments_and_filter(comp_db):
    client = TestClient(app)
    token = get_token(client, comp_db["user_prod"].email)
    headers = {"Authorization": f"Bearer {token}"}
    project_id = comp_db["project"].id

    # Trigger assessment
    client.post(f"/api/v1/rfp-projects/{project_id}/compliance-assessment", headers=headers)

    # List all
    res = client.get(f"/api/v1/rfp-projects/{project_id}/compliance-assessments", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1

def test_human_review_compliance_update(comp_db):
    client = TestClient(app)
    token_prod = get_token(client, comp_db["user_prod"].email)
    headers_prod = {"Authorization": f"Bearer {token_prod}"}
    project_id = comp_db["project"].id
    req_id = comp_db["requirement"].id

    # Trigger
    client.post(f"/api/v1/rfp-projects/{project_id}/compliance-assessment", headers=headers_prod)

    # Update review by VP
    token_vp = get_token(client, comp_db["user_vp"].email)
    headers_vp = {"Authorization": f"Bearer {token_vp}"}

    update_payload = {
        "status": "COMPLIANT",
        "review_status": "APPROVED",
        "reviewer_comments": "Verified with security architecture team."
    }

    res = client.patch(f"/api/v1/rfp-projects/{project_id}/requirements/{req_id}/compliance", json=update_payload, headers=headers_vp)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLIANT"
    assert data["review_status"] == "APPROVED"
    assert data["reviewer_comments"] == "Verified with security architecture team."

def test_tenant_isolation_compliance(comp_db):
    client = TestClient(app)
    token_b = get_token(client, comp_db["user_org_b"].email)
    headers_b = {"Authorization": f"Bearer {token_b}"}
    project_id = comp_db["project"].id

    res = client.get(f"/api/v1/rfp-projects/{project_id}/compliance-assessments", headers=headers_b)
    assert res.status_code == 404
