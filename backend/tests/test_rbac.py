import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.api.deps import get_db, require_role, get_current_user
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

# Add test router for RBAC
test_router = APIRouter()

@test_router.get("/protected/product")
def protected_product(user: User = Depends(require_role([RoleEnum.PRODUCT_TEAM]))):
    return {"message": "Success"}

@test_router.get("/protected/vp")
def protected_vp(user: User = Depends(require_role([RoleEnum.VP]))):
    return {"message": "Success"}

app.include_router(test_router)

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
def rbac_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    
    org1 = Organization(name="Org 1", slug="org1")
    db.add(org1)
    db.commit()

    product_user = User(
        email="product@org1.com",
        full_name="Product",
        password_hash=get_password_hash("password123"),
        organization_id=org1.id,
        role=RoleEnum.PRODUCT_TEAM,
    )
    vp_user = User(
        email="vp@org1.com",
        full_name="VP",
        password_hash=get_password_hash("password123"),
        organization_id=org1.id,
        role=RoleEnum.VP,
    )
    db.add(product_user)
    db.add(vp_user)
    db.commit()
    yield db
    db.close()

def get_token(email: str):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"}
    )
    return response.json()["access_token"]

def test_rbac_allowed(rbac_db):
    client = TestClient(app)
    token = get_token("product@org1.com")
    response = client.get("/protected/product", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200

def test_rbac_forbidden(rbac_db):
    client = TestClient(app)
    token = get_token("product@org1.com")
    response = client.get("/protected/vp", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Not enough permissions"

def test_rbac_vp_allowed(rbac_db):
    client = TestClient(app)
    token = get_token("vp@org1.com")
    response = client.get("/protected/vp", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


