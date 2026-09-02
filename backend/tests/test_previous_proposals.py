import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import io
import uuid
from datetime import datetime, timezone, timedelta

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.rfp_document import (
    RFPDocument,
    DocumentVersion,
    DocumentContent,
    DocumentContentBlock,
    DocumentTypeEnum,
    ProcessingStatusEnum,
    SourceTypeEnum,
)
from app.models.requirement import (
    Requirement,
    RequirementCategoryEnum,
    RequirementTypeEnum,
    RequirementPriorityEnum,
    RequirementStatusEnum,
)
from app.models.previous_proposal import (
    PreviousProposal,
    PreviousProposalVersion,
    PreviousProposalSection,
    ProposalOutcomeEnum,
    ProposalStatusEnum,
)
from app.services.proposal_service import process_proposal_version
from app.services.proposal_retrieval import previous_proposal_retrieval_service
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
def prop_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    orgA = Organization(name="Org A", slug="org-a")
    orgB = Organization(name="Org B", slug="org-b")
    db.add_all([orgA, orgB])
    db.commit()

    user_product_a = User(
        email="product_a@orga.com",
        full_name="Product A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
        role=RoleEnum.PRODUCT_TEAM,
    )
    user_vp_a = User(
        email="vp_a@orga.com",
        full_name="VP A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
        role=RoleEnum.VP,
    )
    user_product_b = User(
        email="product_b@orgb.com",
        full_name="Product B",
        password_hash=get_password_hash("password123"),
        organization_id=orgB.id,
        role=RoleEnum.PRODUCT_TEAM,
    )
    db.add_all([user_product_a, user_vp_a, user_product_b])
    db.commit()

    projA = RFPProject(name="Project A", reference_number="REF-A", organization_id=orgA.id, created_by_id=user_product_a.id)
    db.add(projA)
    db.commit()

    docA = RFPDocument(name="Spec.pdf", document_type=DocumentTypeEnum.PDF, organization_id=orgA.id, rfp_project_id=projA.id, created_by_id=user_product_a.id)
    db.add(docA)
    db.commit()

    verA = DocumentVersion(
        organization_id=orgA.id,
        rfp_document_id=docA.id,
        created_by_id=user_product_a.id,
        version_number=1,
        original_filename="Spec.pdf",
        storage_key="dummy_key_a",
        content_type="application/pdf",
        file_size_bytes=1024,
        checksum_sha256="dummy_sha_a",
        processing_status=ProcessingStatusEnum.COMPLETED,
    )
    db.add(verA)
    db.commit()

    reqA = Requirement(
        id=uuid.uuid4(),
        organization_id=orgA.id,
        rfp_project_id=projA.id,
        document_version_id=verA.id,
        requirement_code="REQ-0001",
        title="SOC2 Type II Certification & Encryption",
        description="Vendor must maintain SOC2 Type II certification and AES-256 data encryption.",
        category=RequirementCategoryEnum.SECURITY,
        requirement_type=RequirementTypeEnum.MANDATORY,
        priority=RequirementPriorityEnum.CRITICAL,
        mandatory=True,
        confidence_score=0.95,
        status=RequirementStatusEnum.EXTRACTED,
        review_required=False,
    )
    db.add(reqA)
    db.commit()

    yield {
        "db": db,
        "orgA": orgA,
        "orgB": orgB,
        "user_a": user_product_a,
        "user_vp_a": user_vp_a,
        "user_b": user_product_b,
        "projA": projA,
        "reqA": reqA,
    }
    db.close()

def get_token(client: TestClient, email: str):
    res = client.post("/auth/login", data={"username": email, "password": "password123"})
    return res.json()["access_token"]

# --- Unit Tests ---

def test_proposal_ingestion_and_sectioning(prop_db):
    db = prop_db["db"]
    org_id = prop_db["orgA"].id
    user_id = prop_db["user_a"].id

    prop = PreviousProposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="FinTech Enterprise Analytics Proposal",
        proposal_reference="PROP-2025-001",
        customer_name="Global Bank Corp",
        outcome=ProposalOutcomeEnum.WON,
        status=ProposalStatusEnum.APPROVED,
    )
    db.add(prop)
    db.commit()

    ver = PreviousProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        previous_proposal_id=prop.id,
        version_number=1,
        raw_content="Section 1: Executive Summary. We provide 24x7 technical support with 99.9% uptime SLA.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add(ver)
    db.commit()

    processed_ver = process_proposal_version(db, ver.id)
    assert processed_ver.processing_status == ProcessingStatusEnum.COMPLETED

    secs = db.query(PreviousProposalSection).filter(PreviousProposalSection.proposal_version_id == ver.id).all()
    assert len(secs) >= 1
    assert secs[0].embedding_dimensions == 2048
    assert "24x7 technical support" in secs[0].content

def test_proposal_retrieval_and_approval_status_filtering(prop_db):
    db = prop_db["db"]
    org_id = prop_db["orgA"].id
    user_id = prop_db["user_a"].id

    # Approved Won Proposal
    prop_approved = PreviousProposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="Approved Historical Proposal",
        proposal_reference="PROP-2025-002",
        outcome=ProposalOutcomeEnum.WON,
        status=ProposalStatusEnum.APPROVED,
        proposal_date=datetime.now(timezone.utc) - timedelta(days=30),
    )
    # Draft Proposal (Should be excluded)
    prop_draft = PreviousProposal(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="Draft Unapproved Proposal",
        proposal_reference="PROP-2025-003",
        outcome=ProposalOutcomeEnum.UNKNOWN,
        status=ProposalStatusEnum.DRAFT,
    )
    db.add_all([prop_approved, prop_draft])
    db.commit()

    ver_approved = PreviousProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        previous_proposal_id=prop_approved.id,
        version_number=1,
        raw_content="Approved Response: AES-256 encryption and SOC2 Type II certification.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    ver_draft = PreviousProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        previous_proposal_id=prop_draft.id,
        version_number=1,
        raw_content="Draft Response: AES-256 encryption draft notes.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add_all([ver_approved, ver_draft])
    db.commit()

    process_proposal_version(db, ver_approved.id)
    process_proposal_version(db, ver_draft.id)

    # Perform Search
    results = previous_proposal_retrieval_service.search_proposals(db, org_id, "AES-256 encryption SOC2")
    assert len(results) == 1
    assert results[0].proposal_id == prop_approved.id
    assert results[0].source_class == "HISTORICAL PROPOSAL"

# --- API & Tenant Isolation Tests ---

def test_previous_proposal_api_and_tenant_isolation(prop_db):
    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_vp = get_token(client, "vp_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    # 1. Product Team A creates Previous Proposal
    res_create = client.post(
        "/api/v1/previous-proposals",
        json={
            "title": "Cloud Analytics 2025 Proposal",
            "proposal_reference": "PROP-2025-100",
            "customer_name": "Acme Corp",
            "outcome": "WON",
            "status": "APPROVED",
            "raw_content": "We support 24x7 live phone and chat support with 99.9% uptime SLA."
        },
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_create.status_code == 200
    prop_data = res_create.json()
    assert prop_data["proposal_reference"] == "PROP-2025-100"
    prop_id = prop_data["id"]

    # VP A lists proposals (Read-only access)
    res_list = client.get(
        "/api/v1/previous-proposals",
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    # 2. Perform Historical Search
    res_search = client.post(
        "/api/v1/previous-proposals/search",
        json={"query": "24x7 phone chat support 99.9% uptime SLA", "top_k": 5},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["total"] >= 1
    assert search_data["results"][0]["source_class"] == "HISTORICAL PROPOSAL"

    # 3. Find previous proposals for RFP Requirement REQ-0001
    proj_id_a = prop_db["projA"].id
    req_id_a = prop_db["reqA"].id

    res_find = client.post(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements/{req_id_a}/find-previous-proposals",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_find.status_code == 200

    # 4. User B Cross-Tenant Access -> Returns 0 results / 404
    res_search_b = client.post(
        "/api/v1/previous-proposals/search",
        json={"query": "24x7 phone chat support", "top_k": 5},
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_search_b.status_code == 200
    assert res_search_b.json()["total"] == 0
