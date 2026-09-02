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
    RequirementEvidence,
    RequirementCategoryEnum,
    RequirementTypeEnum,
    RequirementPriorityEnum,
    RequirementStatusEnum,
    ExtractionStatusEnum,
)
from app.services.requirement_extraction import extract_requirements_for_version
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
def req_db():
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
    projB = RFPProject(name="Project B", reference_number="REF-B", organization_id=orgB.id, created_by_id=user_product_b.id)
    db.add_all([projA, projB])
    db.commit()

    docA = RFPDocument(name="Spec.pdf", document_type=DocumentTypeEnum.PDF, organization_id=orgA.id, rfp_project_id=projA.id, created_by_id=user_product_a.id)
    docB = RFPDocument(name="SpecB.pdf", document_type=DocumentTypeEnum.PDF, organization_id=orgB.id, rfp_project_id=projB.id, created_by_id=user_product_b.id)
    db.add_all([docA, docB])
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
    verB = DocumentVersion(
        organization_id=orgB.id,
        rfp_document_id=docB.id,
        created_by_id=user_product_b.id,
        version_number=1,
        original_filename="SpecB.pdf",
        storage_key="dummy_key_b",
        content_type="application/pdf",
        file_size_bytes=1024,
        checksum_sha256="dummy_sha_b",
        processing_status=ProcessingStatusEnum.COMPLETED,
    )
    db.add_all([verA, verB])
    db.commit()

    docA.current_version_id = verA.id
    docB.current_version_id = verB.id
    db.commit()

    # Create extracted blocks for verA
    contentA = DocumentContent(
        organization_id=orgA.id,
        document_version_id=verA.id,
        full_text="Full text content for Org A RFP",
        character_count=500,
        source_unit_count=2,
    )
    db.add(contentA)
    db.commit()

    block1_a = DocumentContentBlock(
        organization_id=orgA.id,
        document_content_id=contentA.id,
        document_version_id=verA.id,
        sequence_number=1,
        source_type=SourceTypeEnum.PAGE,
        source_index=1,
        text="The vendor must provide 24x7 technical support with 99.9% uptime SLA.",
        metadata_json={"page_number": 1}
    )
    block2_a = DocumentContentBlock(
        organization_id=orgA.id,
        document_content_id=contentA.id,
        document_version_id=verA.id,
        sequence_number=2,
        source_type=SourceTypeEnum.PAGE,
        source_index=2,
        text="All customer data at rest must be encrypted using AES-256 and SOC2 Type II certified.",
        metadata_json={"page_number": 2}
    )
    db.add_all([block1_a, block2_a])
    db.commit()

    yield {
        "db": db,
        "orgA": orgA,
        "orgB": orgB,
        "user_a": user_product_a,
        "user_vp_a": user_vp_a,
        "user_b": user_product_b,
        "projA": projA,
        "docA": docA,
        "verA": verA,
        "block1_a": block1_a,
        "block2_a": block2_a,
        "projB": projB,
        "docB": docB,
        "verB": verB,
    }
    db.close()

def get_token(client: TestClient, email: str):
    res = client.post("/auth/login", data={"username": email, "password": "password123"})
    return res.json()["access_token"]

# --- Extraction Service & LLM Tests ---

@patch("app.services.requirement_extraction.nvidia_llm_client")
def test_extract_requirements_success(mock_llm, req_db):
    b1_id = str(req_db["block1_a"].id)
    b2_id = str(req_db["block2_a"].id)

    mock_llm.extract_requirements_from_blocks.return_value = {
        "requirements": [
            {
                "title": "24x7 Technical Support SLA",
                "description": "The vendor must provide 24x7 technical support with 99.9% uptime SLA.",
                "category": "SUPPORT",
                "requirement_type": "MANDATORY",
                "priority": "HIGH",
                "mandatory": True,
                "confidence_score": 0.95,
                "evidence_block_ids": [b1_id],
                "review_required": False
            },
            {
                "title": "AES-256 Encryption & SOC2",
                "description": "All customer data at rest must be encrypted using AES-256 and SOC2 Type II certified.",
                "category": "SECURITY",
                "requirement_type": "MANDATORY",
                "priority": "CRITICAL",
                "mandatory": True,
                "confidence_score": 0.98,
                "evidence_block_ids": [b2_id],
                "review_required": False
            }
        ]
    }

    db = req_db["db"]
    ver_id = req_db["verA"].id

    res_ver = extract_requirements_for_version(db, ver_id)
    assert res_ver.extraction_status == "COMPLETED"

    reqs = db.query(Requirement).filter(Requirement.document_version_id == ver_id).all()
    assert len(reqs) == 2
    assert reqs[0].requirement_code == "REQ-0001"
    assert reqs[0].category == RequirementCategoryEnum.SUPPORT
    assert reqs[1].category == RequirementCategoryEnum.SECURITY

    # Check evidence link
    ev1 = db.query(RequirementEvidence).filter(RequirementEvidence.requirement_id == reqs[0].id).first()
    assert ev1 is not None
    assert ev1.content_block_id == req_db["block1_a"].id
    assert "24x7 technical support" in ev1.evidence_text
    assert ev1.source_reference == "PAGE 1"

@patch("app.services.requirement_extraction.nvidia_llm_client")
def test_hallucinated_block_id_handling(mock_llm, req_db):
    fake_block_id = str(uuid.uuid4())

    mock_llm.extract_requirements_from_blocks.return_value = {
        "requirements": [
            {
                "title": "Hallucinated Requirement",
                "description": "Requirement with fake block ID",
                "category": "GENERAL",
                "requirement_type": "OPTIONAL",
                "priority": "LOW",
                "mandatory": False,
                "confidence_score": 0.5,
                "evidence_block_ids": [fake_block_id],
                "review_required": True
            }
        ]
    }

    db = req_db["db"]
    ver_id = req_db["verA"].id

    res_ver = extract_requirements_for_version(db, ver_id)
    assert res_ver.extraction_status == "COMPLETED"

    req = db.query(Requirement).filter(Requirement.document_version_id == ver_id).first()
    assert req is not None
    # Review required flagged due to low confidence and fallback evidence link
    assert req.review_required is True
    assert req.status == RequirementStatusEnum.REVIEW_REQUIRED

    # Evidence linked to fallback block 1 in project, ignoring fake_block_id
    ev = db.query(RequirementEvidence).filter(RequirementEvidence.requirement_id == req.id).first()
    assert ev.content_block_id == req_db["block1_a"].id

@patch("app.services.requirement_extraction.nvidia_llm_client")
def test_idempotent_reprocessing(mock_llm, req_db):
    b1_id = str(req_db["block1_a"].id)
    mock_llm.extract_requirements_from_blocks.return_value = {
        "requirements": [
            {
                "title": "Support Requirement",
                "description": "24x7 support",
                "category": "SUPPORT",
                "requirement_type": "MANDATORY",
                "priority": "HIGH",
                "mandatory": True,
                "confidence_score": 0.9,
                "evidence_block_ids": [b1_id],
                "review_required": False
            }
        ]
    }

    db = req_db["db"]
    ver_id = req_db["verA"].id

    # Run 1
    extract_requirements_for_version(db, ver_id)
    count1 = db.query(Requirement).filter(Requirement.document_version_id == ver_id).count()

    # Run 2 (Retry)
    extract_requirements_for_version(db, ver_id)
    count2 = db.query(Requirement).filter(Requirement.document_version_id == ver_id).count()

    assert count1 == count2 == 1

# --- API Endpoints & Tenant Isolation Tests ---

@patch("app.services.requirement_extraction.nvidia_llm_client")
def test_api_extraction_and_human_review_workflow(mock_llm, req_db):
    b1_id = str(req_db["block1_a"].id)
    mock_llm.extract_requirements_from_blocks.return_value = {
        "requirements": [
            {
                "title": "Initial Requirement Title",
                "description": "Requirement description statement",
                "category": "TECHNICAL",
                "requirement_type": "MANDATORY",
                "priority": "HIGH",
                "mandatory": True,
                "confidence_score": 0.6,  # Low confidence -> REVIEW_REQUIRED
                "evidence_block_ids": [b1_id],
                "review_required": True
            }
        ]
    }

    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_vp = get_token(client, "vp_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    proj_id_a = req_db["projA"].id

    # 1. Trigger extraction via API
    res_trigger = client.post(
        f"/api/v1/rfp-projects/{proj_id_a}/requirement-extraction",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_trigger.status_code == 200
    assert res_trigger.json()["status"] == "COMPLETED"

    # 2. List requirements
    res_list = client.get(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_list.status_code == 200
    data_list = res_list.json()
    assert data_list["total"] == 1
    req_item = data_list["items"][0]
    assert req_item["review_required"] is True
    assert req_item["status"] == "REVIEW_REQUIRED"
    req_id = req_item["id"]

    # VP can also list requirements (Read-only)
    res_list_vp = client.get(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements",
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert res_list_vp.status_code == 200

    # 3. Product Team accepts requirement (Human Review)
    res_update = client.patch(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements/{req_id}",
        json={"status": "ACCEPTED", "review_required": False, "title": "Verified Technical Requirement"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["status"] == "ACCEPTED"
    assert res_update.json()["title"] == "Verified Technical Requirement"
    assert res_update.json()["review_required"] is False

    # VP attempt to update review status -> 403 Forbidden
    res_vp_update = client.patch(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements/{req_id}",
        json={"status": "REJECTED"},
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert res_vp_update.status_code == 403

    # User B cross-tenant requirement access -> 404 Not Found
    res_cross = client.get(
        f"/api/v1/rfp-projects/{proj_id_a}/requirements",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_cross.status_code == 404
