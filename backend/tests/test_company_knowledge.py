import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import io
import uuid

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
from app.models.company_knowledge import (
    CompanyKnowledgeDocument,
    KnowledgeDocumentVersion,
    KnowledgeChunk,
    KnowledgeTypeEnum,
    KnowledgeStatusEnum,
    AuthorityLevelEnum,
)
from app.services.knowledge_service import process_knowledge_version
from app.services.hybrid_retrieval import hybrid_retrieval_service
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
def know_db():
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

# --- Knowledge Service & Processing Unit Tests ---

def test_company_knowledge_ingestion_and_chunking(know_db):
    db = know_db["db"]
    org_id = know_db["orgA"].id
    user_id = know_db["user_a"].id

    doc = CompanyKnowledgeDocument(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="Enterprise Security Architecture Standard",
        description="Overview of SOC2 Type II compliance and AES-256 encryption policies.",
        knowledge_type=KnowledgeTypeEnum.SECURITY,
        status=KnowledgeStatusEnum.ACTIVE,
        authority_level=AuthorityLevelEnum.AUTHORITATIVE,
    )
    db.add(doc)
    db.commit()

    ver = KnowledgeDocumentVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        knowledge_document_id=doc.id,
        version_number=1,
        raw_content="Our platform maintains annual SOC2 Type II certification. All customer data at rest is encrypted using AES-256.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add(ver)
    db.commit()

    processed_ver = process_knowledge_version(db, ver.id)
    assert processed_ver.processing_status == ProcessingStatusEnum.COMPLETED

    chunks = db.query(KnowledgeChunk).filter(KnowledgeChunk.knowledge_version_id == ver.id).all()
    assert len(chunks) >= 1
    assert chunks[0].embedding_dimensions == 2048
    assert len(chunks[0].embedding) == 2048
    assert "SOC2 Type II" in chunks[0].content

# --- Hybrid Retrieval Unit Tests ---

def test_hybrid_retrieval_and_status_filtering(know_db):
    db = know_db["db"]
    org_id = know_db["orgA"].id
    user_id = know_db["user_a"].id

    # Active Authoritative Document
    doc_active = CompanyKnowledgeDocument(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="Active Security Policy",
        knowledge_type=KnowledgeTypeEnum.SECURITY,
        status=KnowledgeStatusEnum.ACTIVE,
        authority_level=AuthorityLevelEnum.AUTHORITATIVE,
    )
    # Draft Document
    doc_draft = CompanyKnowledgeDocument(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by_id=user_id,
        title="Draft Experimental Policy",
        knowledge_type=KnowledgeTypeEnum.SECURITY,
        status=KnowledgeStatusEnum.DRAFT,
        authority_level=AuthorityLevelEnum.REFERENCE,
    )
    db.add_all([doc_active, doc_draft])
    db.commit()

    ver_active = KnowledgeDocumentVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        knowledge_document_id=doc_active.id,
        version_number=1,
        raw_content="Active Policy: Guaranteed 99.9% uptime SLA.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    ver_draft = KnowledgeDocumentVersion(
        id=uuid.uuid4(),
        organization_id=org_id,
        knowledge_document_id=doc_draft.id,
        version_number=1,
        raw_content="Draft Policy: 99.9% uptime SLA draft info.",
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add_all([ver_active, ver_draft])
    db.commit()

    process_knowledge_version(db, ver_active.id)
    process_knowledge_version(db, ver_draft.id)

    # Perform Search
    results = hybrid_retrieval_service.search_knowledge(db, org_id, "99.9% uptime SLA")
    assert len(results) == 1
    assert results[0].knowledge_document_id == doc_active.id
    assert results[0].authority_level == "AUTHORITATIVE"

# --- API & Tenant Isolation Tests ---

def test_company_knowledge_api_and_tenant_isolation(know_db):
    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_vp = get_token(client, "vp_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    # 1. Product Team A creates Knowledge Document
    res_create = client.post(
        "/api/v1/company-knowledge",
        json={
            "title": "24x7 Enterprise Support SLA",
            "description": "Round-the-clock technical support policy",
            "knowledge_type": "SUPPORT",
            "authority_level": "AUTHORITATIVE",
            "raw_content": "We offer 24x7 phone, email, and live chat technical support with 15-minute SLA."
        },
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_create.status_code == 200
    doc_data = res_create.json()
    assert doc_data["title"] == "24x7 Enterprise Support SLA"
    assert doc_data["status"] == "ACTIVE"  # Auto-activated upon ingestion
    doc_id = doc_data["id"]

    # VP A lists knowledge (Read-only access)
    res_list = client.get(
        "/api/v1/company-knowledge",
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    # VP A attempt to update document -> 403 Forbidden
    res_vp_patch = client.patch(
        f"/api/v1/company-knowledge/{doc_id}",
        json={"status": "ARCHIVED"},
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert res_vp_patch.status_code == 403

    # 2. Perform Hybrid Search
    res_search = client.post(
        "/api/v1/knowledge/search",
        json={"query": "24x7 technical support SLA", "top_k": 5},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["total"] >= 1
    assert "24x7 phone, email" in search_data["results"][0]["content"]

    # 3. Find evidence for RFP Requirement REQ-0001
    proj_id_a = know_db["projA"].id
    req_id_a = know_db["reqA"].id

    res_find_ev = client.post(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements/{req_id_a}/find-evidence",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_find_ev.status_code == 200

    # 4. User B Cross-Tenant Access -> Returns 0 results / 404
    res_search_b = client.post(
        "/api/v1/knowledge/search",
        json={"query": "24x7 technical support SLA", "top_k": 5},
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_search_b.status_code == 200
    assert res_search_b.json()["total"] == 0
