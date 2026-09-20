import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject, ProjectStatusEnum
from app.models.requirement import Requirement, RequirementCategoryEnum, RequirementTypeEnum, RequirementPriorityEnum, RequirementStatusEnum
from app.models.compliance import ComplianceAssessment, ComplianceStatusEnum, GapAnalysis, GapSeverityEnum, RiskAnalysis, RiskSeverityEnum, RiskCategoryEnum
from app.models.proposal import Proposal, ProposalVersion, ProposalStatusEnum

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

def get_auth_headers(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/login", data={"username": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def dashboard_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    # Create test Organizations
    org_a = Organization(id=uuid.uuid4(), name="Dashboard Org A", slug="dash-org-a")
    org_b = Organization(id=uuid.uuid4(), name="Dashboard Org B", slug="dash-org-b")
    db.add_all([org_a, org_b])
    db.commit()

    pwd_hash = get_password_hash("password123")

    # Create Users for Org A
    user_prod = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="dash_prod@orga.com",
        full_name="Prod Team User",
        role=RoleEnum.PRODUCT_TEAM,
        password_hash=pwd_hash,
        is_active=True,
    )
    user_vp = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="dash_vp@orga.com",
        full_name="VP User",
        role=RoleEnum.VP,
        password_hash=pwd_hash,
        is_active=True,
    )
    user_cto = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="dash_cto@orga.com",
        full_name="CTO User",
        role=RoleEnum.CTO,
        password_hash=pwd_hash,
        is_active=True,
    )
    user_ceo = User(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        email="dash_ceo@orga.com",
        full_name="CEO User",
        role=RoleEnum.CEO,
        password_hash=pwd_hash,
        is_active=True,
    )

    # User for Org B
    user_org_b = User(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        email="user@orgb.com",
        full_name="Org B User",
        role=RoleEnum.PRODUCT_TEAM,
        password_hash=pwd_hash,
        is_active=True,
    )

    db.add_all([user_prod, user_vp, user_cto, user_ceo, user_org_b])
    db.commit()

    # Create RFP Project for Org A
    project_a = RFPProject(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        created_by_id=user_prod.id,
        name="Dashboard Test RFP Project A",
        reference_number="DASH-RFP-001",
        status=ProjectStatusEnum.ACTIVE,
    )
    db.add(project_a)
    db.commit()

    # Create Requirements for Org A
    req1 = Requirement(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project_a.id,
        document_version_id=uuid.uuid4(),
        requirement_code="DASH-REQ-1",
        title="Zero Trust Security Architecture",
        description="Must support mutual TLS and zero-trust data residency.",
        category=RequirementCategoryEnum.SECURITY,
        requirement_type=RequirementTypeEnum.MANDATORY,
        priority=RequirementPriorityEnum.CRITICAL,
        status=RequirementStatusEnum.ACCEPTED,
    )
    req2 = Requirement(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project_a.id,
        document_version_id=uuid.uuid4(),
        requirement_code="DASH-REQ-2",
        title="High Availability SLA",
        description="99.99% uptime required across multi-region deployment.",
        category=RequirementCategoryEnum.TECHNICAL,
        requirement_type=RequirementTypeEnum.MANDATORY,
        priority=RequirementPriorityEnum.HIGH,
        status=RequirementStatusEnum.EXTRACTED,
    )
    db.add_all([req1, req2])
    db.commit()

    # Create Compliance, Gap, Risk for Org A
    comp1 = ComplianceAssessment(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project_a.id,
        requirement_id=req1.id,
        status=ComplianceStatusEnum.COMPLIANT,
        rationale="Supported via automated mTLS gateways.",
    )
    comp2 = ComplianceAssessment(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project_a.id,
        requirement_id=req2.id,
        status=ComplianceStatusEnum.PARTIALLY_COMPLIANT,
        rationale="Requires secondary failover node setup.",
    )
    db.add_all([comp1, comp2])
    db.commit()

    gap1 = GapAnalysis(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        assessment_id=comp2.id,
        requirement_id=req2.id,
        missing_capability="Secondary multi-region sync gateway",
        gap_severity=GapSeverityEnum.HIGH,
        suggested_action="Deploy automated active-active cluster",
    )
    risk1 = RiskAnalysis(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        assessment_id=comp2.id,
        requirement_id=req2.id,
        risk_category=RiskCategoryEnum.TECHNICAL,
        severity=RiskSeverityEnum.HIGH,
        rationale="Potential latency spikes during region failover",
        mitigation_action="Implement local caching",
    )
    db.add_all([gap1, risk1])
    db.commit()

    # Create Proposals & Versions for Org A
    prop1 = Proposal(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        rfp_project_id=project_a.id,
        title="Dashboard Proposal Alpha",
        status=ProposalStatusEnum.VP_REVIEW,
        created_by_id=user_prod.id,
    )
    db.add(prop1)
    db.commit()

    ver1 = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        proposal_id=prop1.id,
        version_number=1,
        status=ProposalStatusEnum.VP_REVIEW,
        current_stage="VP",
        is_immutable=True,
        created_by_id=user_prod.id,
    )
    prop1.current_version_id = ver1.id
    db.add(ver1)
    db.commit()

    project_a_id = str(project_a.id)
    prop1_id = str(prop1.id)
    ver1_id = str(ver1.id)
    db.close()
    return {
        "project_a_id": project_a_id,
        "prop1_id": prop1_id,
        "ver1_id": ver1_id,
    }

def test_get_dashboard_summary_product_team(dashboard_db):
    client = TestClient(app)
    headers = get_auth_headers(client, "dash_prod@orga.com")

    resp = client.get("/api/v1/dashboard/summary", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["user_role"] == "PRODUCT_TEAM"
    kpis = data["kpis"]
    assert kpis["active_rfps_count"] >= 1
    assert kpis["total_requirements_count"] >= 2
    assert kpis["accepted_requirements_count"] >= 1
    assert kpis["compliant_items_count"] >= 1
    assert kpis["open_gaps_count"] >= 1
    assert kpis["total_risks_count"] >= 1
    assert kpis["proposals_in_progress_count"] >= 1

    # Distributions check
    assert len(data["rfp_status_distribution"]) > 0
    assert len(data["requirement_priority_distribution"]) > 0
    assert len(data["requirement_category_distribution"]) > 0
    assert len(data["compliance_status_distribution"]) > 0
    assert len(data["gap_severity_distribution"]) > 0
    assert len(data["risk_severity_distribution"]) > 0

def test_get_dashboard_summary_vp_role(dashboard_db):
    client = TestClient(app)
    headers = get_auth_headers(client, "dash_vp@orga.com")

    resp = client.get("/api/v1/dashboard/summary", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["user_role"] == "VP"
    queue = data["approval_queue"]
    assert len(queue) >= 1
    assert queue[0]["current_stage"] == "VP"

def test_get_dashboard_summary_cto_role(dashboard_db):
    client = TestClient(app)
    headers = get_auth_headers(client, "dash_cto@orga.com")

    resp = client.get("/api/v1/dashboard/summary", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["user_role"] == "CTO"
    assert data["kpis"]["proposals_awaiting_my_review_count"] == 0

def test_dashboard_tenant_isolation(dashboard_db):
    client = TestClient(app)
    headers = get_auth_headers(client, "user@orgb.com")

    resp = client.get("/api/v1/dashboard/summary", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["kpis"]["active_rfps_count"] == 0
    assert data["kpis"]["total_requirements_count"] == 0
    assert data["kpis"]["open_gaps_count"] == 0
    assert data["kpis"]["total_risks_count"] == 0
    assert data["kpis"]["proposals_in_progress_count"] == 0
    assert len(data["approval_queue"]) == 0

def test_dashboard_filtering(dashboard_db):
    client = TestClient(app)
    headers = get_auth_headers(client, "dash_prod@orga.com")

    project_id = dashboard_db["project_a_id"]
    resp = client.get(
        f"/api/v1/dashboard/summary?rfp_project_id={project_id}&category=SECURITY&priority=CRITICAL",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["kpis"]["total_requirements_count"] == 1
