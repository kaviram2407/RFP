import pytest
from fastapi import APIRouter, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import uuid

from app.main import app
from app.db.base import Base
from app.api.deps import get_db, get_current_user
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

tenant_router = APIRouter()

# Dummy endpoint simulating organization data access
@tenant_router.get("/organization/{org_id}/data")
def get_org_data(org_id: str, user: User = Depends(get_current_user)):
    if str(user.organization_id) != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access denied")
    return {"data": "Secret Org Data"}

app.include_router(tenant_router)

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
def tenant_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    
    orgA = Organization(name="Org A", slug="orga")
    orgB = Organization(name="Org B", slug="orgb")
    db.add(orgA)
    db.add(orgB)
    db.commit()

    userA = User(
        email="user@orga.com",
        full_name="User A",
        password_hash=get_password_hash("password123"),
        organization_id=orgA.id,
    )
    userB = User(
        email="user@orgb.com",
        full_name="User B",
        password_hash=get_password_hash("password123"),
        organization_id=orgB.id,
    )
    db.add(userA)
    db.add(userB)
    db.commit()
    yield {"db": db, "orgA": orgA, "orgB": orgB}
    db.close()

def get_token(email: str):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"}
    )
    return response.json()["access_token"]

def test_tenant_access_allowed(tenant_db):
    client = TestClient(app)
    orgA = tenant_db["orgA"]
    token = get_token("user@orga.com")
    response = client.get(f"/organization/{orgA.id}/data", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["data"] == "Secret Org Data"

def test_tenant_access_denied(tenant_db):
    client = TestClient(app)
    orgB = tenant_db["orgB"]
    token = get_token("user@orga.com")
    response = client.get(f"/organization/{orgB.id}/data", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Cross-tenant access denied"


