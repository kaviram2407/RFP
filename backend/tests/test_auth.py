import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
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
def test_db():
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    db = TestingSessionLocal()
    # clean db
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    
    # create org and users
    org1 = Organization(name="Org 1", slug="org1")
    db.add(org1)
    db.commit()

    user = User(
        email="user@org1.com",
        full_name="User 1",
        password_hash=get_password_hash("password123"),
        organization_id=org1.id,
        role=RoleEnum.PRODUCT_TEAM,
        is_active=True
    )
    inactive_user = User(
        email="inactive@org1.com",
        full_name="Inactive User",
        password_hash=get_password_hash("password123"),
        organization_id=org1.id,
        role=RoleEnum.PRODUCT_TEAM,
        is_active=False
    )
    db.add(user)
    db.add(inactive_user)
    db.commit()
    yield db
    db.close()

def test_login_success(test_db):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": "user@org1.com", "password": "password123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_login_incorrect_password(test_db):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": "user@org1.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_unknown_user(test_db):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": "unknown@org1.com", "password": "password123"}
    )
    assert response.status_code == 401

def test_login_inactive_user(test_db):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": "inactive@org1.com", "password": "password123"}
    )
    assert response.status_code == 401

def test_read_users_me(test_db):
    client = TestClient(app)
    response = client.post(
        "/auth/login",
        data={"username": "user@org1.com", "password": "password123"}
    )
    token = response.json()["access_token"]
    
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "user@org1.com"
    assert "password_hash" not in response.json()

def test_read_users_me_invalid_token():
    client = TestClient(app)
    response = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalidtoken"}
    )
    assert response.status_code == 401

def test_read_users_me_no_token():
    client = TestClient(app)
    response = client.get("/auth/me")
    assert response.status_code == 401

