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
from app.models.proposal import (
    Proposal,
    ProposalVersion,
    ProposalSection,
    ProposalApproval,
    ProposalStatusEnum,
    GenerationStatusEnum,
)
from app.models.audit import AuditLog
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
def approval_db():
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
        email="prod_workflow@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.PRODUCT_TEAM,
        full_name="Product Team User",
        is_active=True
    )
    user_vp = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="vp_workflow@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.VP,
        full_name="VP User",
        is_active=True
    )
    user_cto = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="cto_workflow@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.CTO,
        full_name="CTO User",
        is_active=True
    )
    user_ceo = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="ceo_workflow@orga.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.CEO,
        full_name="CEO User",
        is_active=True
    )
    user_org_b = User(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        email="user_workflow@orgb.com",
        password_hash=get_password_hash("password123"),
        role=RoleEnum.PRODUCT_TEAM,
        full_name="Org B User",
        is_active=True
    )
    db.add_all([user_prod, user_vp, user_cto, user_ceo, user_org_b])
    db.commit()

    project = RFPProject(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        name="Phase 11 Workflow Project",
        reference_number="REF-WORKFLOW-100",
        customer_name="Global Enterprise",
        status="ACTIVE",
        created_by_id=user_prod.id
    )
    db.add(project)
    db.commit()

    yield {
        "db": db,
        "org_a": org_a,
        "org_b": org_b,
        "user_prod": user_prod,
        "user_vp": user_vp,
        "user_cto": user_cto,
        "user_ceo": user_ceo,
        "user_org_b": user_org_b,
        "project": project
    }

def get_auth_headers(client: TestClient, email: str, password: str = "password123"):
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def create_sample_proposal(client: TestClient, headers: dict, project_id: str):
    resp = client.post(
        f"/api/v1/rfp-projects/{project_id}/proposals",
        json={"title": "Phase 11 Executive Proposal", "description": "Workflow Test"},
        headers=headers
    )
    assert resp.status_code == 201
    return resp.json()

def test_full_linear_approval_workflow_and_rbac(approval_db):
    client = TestClient(app)
    db = approval_db["db"]
    project_id = str(approval_db["project"].id)

    prod_headers = get_auth_headers(client, "prod_workflow@orga.com")
    vp_headers = get_auth_headers(client, "vp_workflow@orga.com")
    cto_headers = get_auth_headers(client, "cto_workflow@orga.com")
    ceo_headers = get_auth_headers(client, "ceo_workflow@orga.com")
    org_b_headers = get_auth_headers(client, "user_workflow@orgb.com")

    # 1. Create Proposal as Product Team
    prop = create_sample_proposal(client, prod_headers, project_id)
    proposal_id = prop["id"]
    version_id = prop["current_version_id"]

    # 5. CTO cannot act before VP approval (Status: DRAFT)
    cto_early = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "Premature CTO review"},
        headers=cto_headers
    )
    assert cto_early.status_code == 400

    # 9. CEO cannot act before CTO approval
    ceo_early = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "Premature CEO review"},
        headers=ceo_headers
    )
    assert ceo_early.status_code == 400

    # 1. Product Team submits version for review
    submit_resp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/submit",
        headers=prod_headers
    )
    assert submit_resp.status_code == 200, submit_resp.text
    ver_data = submit_resp.json()
    assert ver_data["status"] == "VP_REVIEW"
    assert ver_data["current_stage"] == "VP"
    assert ver_data["is_immutable"] is True

    # 17. Wrong role cannot approve stage (Product Team attempts to approve VP stage)
    prod_approve = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "Self approval attempt"},
        headers=prod_headers
    )
    assert prod_approve.status_code == 403

    # CTO cannot approve at VP stage
    cto_at_vp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "CTO skipping VP"},
        headers=cto_headers
    )
    assert cto_at_vp.status_code == 403

    # 2. VP approves VP stage
    vp_app = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "VP Commercial & Legal Approval Granted."},
        headers=vp_headers
    )
    assert vp_app.status_code == 200
    assert vp_app.json()["stage"] == "VP"
    assert vp_app.json()["decision"] == "APPROVED"

    # 16. Duplicate approval is idempotent
    vp_dup = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "VP Duplicate Click"},
        headers=vp_headers
    )
    assert vp_dup.status_code == 200

    # Verify stage advanced to CTO_REVIEW
    st_resp = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-status",
        headers=cto_headers
    )
    assert st_resp.status_code == 200
    assert st_resp.json()["current_stage"] == "CTO"
    assert st_resp.json()["current_status"] == "CTO_REVIEW"
    assert st_resp.json()["can_user_approve"] is True

    # 6. CTO approves CTO stage
    cto_app = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "CTO Technical Architecture & Security Approved."},
        headers=cto_headers
    )
    assert cto_app.status_code == 200
    assert cto_app.json()["stage"] == "CTO"

    # Verify stage advanced to CEO_REVIEW
    st_ceo = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-status",
        headers=ceo_headers
    )
    assert st_ceo.status_code == 200
    assert st_ceo.json()["current_stage"] == "CEO"
    assert st_ceo.json()["current_status"] == "CEO_REVIEW"

    # 10. CEO approves CEO stage
    ceo_app = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "APPROVED", "comment": "CEO Final Approval Granted."},
        headers=ceo_headers
    )
    assert ceo_app.status_code == 200
    assert ceo_app.json()["stage"] == "CEO"

    # Verify Final Approved State
    final_st = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-status",
        headers=prod_headers
    )
    assert final_st.json()["current_status"] == "APPROVED"
    assert final_st.json()["is_immutable"] is True

    # 13. Approved version is immutable (Section editing blocked)
    sec_id = ver_data["sections"][0]["id"]
    edit_resp = client.patch(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}",
        json={"content": "Attempted edit after approval"},
        headers=prod_headers
    )
    assert edit_resp.status_code == 400

    # 19. Historical approval records preserved
    hist_resp = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-history",
        headers=prod_headers
    )
    assert hist_resp.status_code == 200
    history = hist_resp.json()
    assert len(history) == 3
    assert [h["stage"] for h in history] == ["VP", "CTO", "CEO"]

    # 18. Tenant isolation
    org_b_st = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-status",
        headers=org_b_headers
    )
    assert org_b_st.status_code == 404

    # 20. Audit events generated
    audits = db.query(AuditLog).filter(AuditLog.entity_id == uuid.UUID(version_id)).all()
    assert len(audits) >= 4  # SUBMITTED, VP APPROVED, CTO APPROVED, CEO APPROVED

def test_request_changes_and_revision_pathway(approval_db):
    client = TestClient(app)
    project_id = str(approval_db["project"].id)

    prod_headers = get_auth_headers(client, "prod_workflow@orga.com")
    vp_headers = get_auth_headers(client, "vp_workflow@orga.com")
    cto_headers = get_auth_headers(client, "cto_workflow@orga.com")

    # 1. Create & Submit Proposal Version 1
    prop = create_sample_proposal(client, prod_headers, project_id)
    proposal_id = prop["id"]
    v1_id = prop["current_version_id"]

    client.post(f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/submit", headers=prod_headers)

    # VP approves Version 1
    client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/review",
        json={"decision": "APPROVED", "comment": "VP approved v1."},
        headers=vp_headers
    )

    # 7. CTO requests changes on Version 1
    cto_req = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/review",
        json={"decision": "REQUEST_CHANGES", "comment": "Clarify disaster recovery RTO/RPO targets."},
        headers=cto_headers
    )
    print("DEBUG cto_req response:", cto_req.status_code, cto_req.text)
    assert cto_req.status_code == 200
    assert cto_req.json()["decision"] == "REQUEST_CHANGES"

    # Status updated to CHANGES_REQUESTED
    v1_st = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/approval-status",
        headers=prod_headers
    )
    assert v1_st.json()["current_status"] == "CHANGES_REQUESTED"
    assert v1_st.json()["is_immutable"] is True

    # 15. Product Team creates revision (Version 2)
    rev_resp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/revisions",
        headers=prod_headers
    )
    assert rev_resp.status_code == 201
    v2_data = rev_resp.json()
    assert v2_data["version_number"] == 2
    assert v2_data["status"] == "DRAFT"
    assert v2_data["is_immutable"] is False

    v2_id = v2_data["id"]

    # Product Team edits section in Version 2
    sec_id = v2_data["sections"][0]["id"]
    edit_v2 = client.patch(
        f"/api/v1/proposals/{proposal_id}/versions/{v2_id}/sections/{sec_id}",
        json={"content": "## Updated DR Strategy\n\nRTO: 15 mins, RPO: 5 mins."},
        headers=prod_headers
    )
    assert edit_v2.status_code == 200

    # Product Team submits Version 2 (must re-enter VP review)
    v2_sub = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{v2_id}/submit",
        headers=prod_headers
    )
    assert v2_sub.status_code == 200
    assert v2_sub.json()["status"] == "VP_REVIEW"
    assert v2_sub.json()["current_stage"] == "VP"

    # Version 1 history preserved completely
    v1_hist = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{v1_id}/approval-history",
        headers=prod_headers
    )
    assert len(v1_hist.json()) == 2
    assert v1_hist.json()[1]["decision"] == "REQUEST_CHANGES"

def test_rejection_workflow(approval_db):
    client = TestClient(app)
    project_id = str(approval_db["project"].id)

    prod_headers = get_auth_headers(client, "prod_workflow@orga.com")
    vp_headers = get_auth_headers(client, "vp_workflow@orga.com")

    # 1. Create & Submit Proposal
    prop = create_sample_proposal(client, prod_headers, project_id)
    proposal_id = prop["id"]
    version_id = prop["current_version_id"]

    client.post(f"/api/v1/proposals/{proposal_id}/versions/{version_id}/submit", headers=prod_headers)

    # 4. VP rejects proposal
    rej_resp = client.post(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/review",
        json={"decision": "REJECTED", "comment": "Commercial terms fail minimum margin policy."},
        headers=vp_headers
    )
    assert rej_resp.status_code == 200
    assert rej_resp.json()["decision"] == "REJECTED"

    # 14. Rejected version remains preserved and immutable
    st_resp = client.get(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/approval-status",
        headers=prod_headers
    )
    assert st_resp.json()["current_status"] == "REJECTED"
    assert st_resp.json()["is_immutable"] is True

    # Editing rejected version is blocked
    sec_id = prop["current_version"]["sections"][0]["id"]
    edit_resp = client.patch(
        f"/api/v1/proposals/{proposal_id}/versions/{version_id}/sections/{sec_id}",
        json={"content": "Attempt edit"},
        headers=prod_headers
    )
    assert edit_resp.status_code == 400
