import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import uuid

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject, ProjectStatusEnum
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
def project_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    # Create Organization A
    orgA = Organization(name="Org A", slug="org-a")
    # Create Organization B
    orgB = Organization(name="Org B", slug="org-b")
    db.add(orgA)
    db.add(orgB)
    db.commit()

    # Users in Org A
    product_user_a = User(
        email="product_a@orga.com",
        full_name="Product A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
        role=RoleEnum.PRODUCT_TEAM,
    )
    vp_user_a = User(
        email="vp_a@orga.com",
        full_name="VP A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
        role=RoleEnum.VP,
    )
    cto_user_a = User(
        email="cto_a@orga.com",
        full_name="CTO A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
        role=RoleEnum.CTO,
    )

    # Users in Org B
    product_user_b = User(
        email="product_b@orgb.com",
        full_name="Product B",
        password_hash=get_password_hash("password123"),
        organization_id=orgB.id,
        role=RoleEnum.PRODUCT_TEAM,
    )

    db.add_all([product_user_a, vp_user_a, cto_user_a, product_user_b])
    db.commit()

    yield {
        "db": db,
        "orgA": orgA,
        "orgB": orgB,
        "product_a": product_user_a,
        "vp_a": vp_user_a,
        "cto_a": cto_user_a,
        "product_b": product_user_b,
    }
    db.close()

def get_token(client: TestClient, email: str):
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"}
    )
    return response.json()["access_token"]

# --- Create Project Tests ---

def test_create_project_product_team_success(project_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")

    payload = {
        "name": "Cloud Migration RFP",
        "reference_number": "RFP-2026-001",
        "description": "Migration to cloud infrastructure",
        "customer_name": "Acme Corp",
        "customer_contact": "contact@acme.com",
        "submission_deadline": "2026-12-31T23:59:59Z"
    }

    response = client.post(
        "/api/v1/rfp-projects",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Cloud Migration RFP"
    assert data["reference_number"] == "RFP-2026-001"
    assert data["status"] == "DRAFT"
    assert data["organization_id"] == str(project_db["orgA"].id)
    assert data["created_by_id"] == str(project_db["product_a"].id)

def test_create_project_rbac_denied_for_vp(project_db):
    client = TestClient(app)
    token = get_token(client, "vp_a@orga.com")

    payload = {
        "name": "Unauthorized RFP",
        "reference_number": "RFP-2026-002"
    }

    response = client.post(
        "/api/v1/rfp-projects",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Not enough permissions"

def test_create_project_duplicate_reference_number(project_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")

    payload = {
        "name": "Project 1",
        "reference_number": "REF-100"
    }
    res1 = client.post(
        "/api/v1/rfp-projects",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res1.status_code == 201

    # Try creating with duplicate reference number in same org
    res2 = client.post(
        "/api/v1/rfp-projects",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]

def test_create_project_empty_name_validation(project_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")

    payload = {
        "name": "   ",
        "reference_number": "REF-101"
    }

    response = client.post(
        "/api/v1/rfp-projects",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 422

# --- List & Read Projects Tests ---

def test_list_projects_and_tenant_isolation(project_db):
    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    # Create project in Org A
    client.post(
        "/api/v1/rfp-projects",
        json={"name": "Org A Project", "reference_number": "REF-A"},
        headers={"Authorization": f"Bearer {token_a}"}
    )

    # Create project in Org B
    client.post(
        "/api/v1/rfp-projects",
        json={"name": "Org B Project", "reference_number": "REF-B"},
        headers={"Authorization": f"Bearer {token_b}"}
    )

    # Org A user listing
    res_a = client.get("/api/v1/rfp-projects", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total"] == 1
    assert data_a["items"][0]["name"] == "Org A Project"

    # VP in Org A can also read
    token_vp_a = get_token(client, "vp_a@orga.com")
    res_vp = client.get("/api/v1/rfp-projects", headers={"Authorization": f"Bearer {token_vp_a}"})
    assert res_vp.status_code == 200
    assert res_vp.json()["total"] == 1

def test_get_project_cross_tenant_denied(project_db):
    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    res_create = client.post(
        "/api/v1/rfp-projects",
        json={"name": "Org A Secret Project", "reference_number": "SECRET-A"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    project_id = res_create.json()["id"]

    # User B attempts to access Org A's project
    res_get_b = client.get(f"/api/v1/rfp-projects/{project_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res_get_b.status_code == 404
    assert res_get_b.json()["detail"] == "RFP Project not found."

# --- Update & Lifecycle Tests ---

def test_update_project_and_status_transitions(project_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")

    res_create = client.post(
        "/api/v1/rfp-projects",
        json={"name": "Lifecycle Project", "reference_number": "LIFE-01"},
        headers={"Authorization": f"Bearer {token}"}
    )
    project_id = res_create.json()["id"]
    assert res_create.json()["status"] == "DRAFT"

    # Invalid status transition: DRAFT -> AWARDED (not allowed)
    res_invalid = client.patch(
        f"/api/v1/rfp-projects/{project_id}",
        json={"status": "AWARDED"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_invalid.status_code == 400
    assert "Invalid status transition" in res_invalid.json()["detail"]

    # Valid status transition: DRAFT -> ACTIVE
    res_valid1 = client.patch(
        f"/api/v1/rfp-projects/{project_id}",
        json={"status": "ACTIVE", "customer_name": "Big Corp"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_valid1.status_code == 200
    assert res_valid1.json()["status"] == "ACTIVE"
    assert res_valid1.json()["customer_name"] == "Big Corp"

    # Valid status transition: ACTIVE -> SUBMITTED
    res_valid2 = client.patch(
        f"/api/v1/rfp-projects/{project_id}",
        json={"status": "SUBMITTED"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_valid2.status_code == 200
    assert res_valid2.json()["status"] == "SUBMITTED"

# --- Archive Tests ---

def test_archive_project(project_db):
    client = TestClient(app)
    token_a = get_token(client, "product_a@orga.com")
    token_b = get_token(client, "product_b@orgb.com")

    res_create = client.post(
        "/api/v1/rfp-projects",
        json={"name": "Archiving Target Project", "reference_number": "ARCH-01"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    project_id = res_create.json()["id"]

    # User B cross-tenant archive attempt -> 404
    res_arch_b = client.post(
        f"/api/v1/rfp-projects/{project_id}/archive",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_arch_b.status_code == 404

    # User A archives project
    res_arch_a = client.post(
        f"/api/v1/rfp-projects/{project_id}/archive",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_arch_a.status_code == 200
    data_arch = res_arch_a.json()
    assert data_arch["status"] == "ARCHIVED"
    assert data_arch["archived_at"] is not None

    # Idempotent second archive call
    res_arch_again = client.post(
        f"/api/v1/rfp-projects/{project_id}/archive",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_arch_again.status_code == 200
