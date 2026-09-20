import io
import zipfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import jwt

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash, create_access_token
from app.core.config import settings
from app.core.redis import revoke_jti, is_jti_revoked
from app.services.storage import validate_uploaded_file, DocumentTypeEnum

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
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    org1 = Organization(name="Audit Org 1", slug="audit-org1")
    db.add(org1)
    db.commit()

    user = User(
        email="audituser@org1.com",
        full_name="Audit User",
        password_hash=get_password_hash("password123"),
        organization_id=org1.id,
        role=RoleEnum.PRODUCT_TEAM,
        is_active=True
    )
    db.add(user)
    db.commit()
    yield db
    db.close()

# ----------------------------------------------------
# 1. M-01 — JWT SERVER-SIDE REVOCATION TESTS
# ----------------------------------------------------
def test_jwt_revocation_flow(test_db):
    client = TestClient(app)
    # Login to get fresh token
    login_res = client.post("/auth/login", data={"username": "audituser@org1.com", "password": "password123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # 1. Fresh token works
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200

    # 2. Logout / revoke token
    logout_res = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200
    assert logout_res.json()["message"] == "Successfully logged out"

    # 3. Revoked token receives 401
    revoked_me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert revoked_me_res.status_code == 401
    assert "revoked" in revoked_me_res.json()["detail"].lower()

    # 4. Another fresh login works
    fresh_login_res = client.post("/auth/login", data={"username": "audituser@org1.com", "password": "password123"})
    assert fresh_login_res.status_code == 200
    new_token = fresh_login_res.json()["access_token"]
    assert new_token != token

    fresh_me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert fresh_me_res.status_code == 200

def test_jwt_invalid_signature_and_expiration(test_db):
    client = TestClient(app)
    # Invalid signature
    bad_token = jwt.encode({"sub": "some-user-id"}, "wrong-secret", algorithm="HS256")
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
    assert res.status_code == 401

    # Expired token
    expired_token = jwt.encode({"sub": "some-user-id", "exp": 1000000000}, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401

def test_redis_unavailable_fail_open_behavior(test_db, monkeypatch):
    client = TestClient(app)
    login_res = client.post("/auth/login", data={"username": "audituser@org1.com", "password": "password123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # Mock Redis failure (returning None)
    monkeypatch.setattr("app.core.redis.get_redis_client", lambda: None)

    # In FAIL-OPEN mode, valid signed token continues to work despite Redis outage
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "audituser@org1.com"

# ----------------------------------------------------
# 2. M-02 — RATE LIMITING TESTS
# ----------------------------------------------------
def test_rate_limiting_login(test_db):
    client = TestClient(app)
    orig_env = settings.APP_ENV
    try:
        settings.APP_ENV = "development"
        # Temporarily set limit low to test limit trigger
        settings.RATE_LIMIT_LOGIN = "3/minute"
        hit_429 = False
        for _ in range(5):
            res = client.post("/auth/login", data={"username": "audituser@org1.com", "password": "wrong"})
            if res.status_code == 429:
                hit_429 = True
                assert "Retry-After" in res.headers
                assert res.json()["detail"] == "Rate limit exceeded. Please try again later."
                break
        assert hit_429
    finally:
        settings.RATE_LIMIT_LOGIN = "10/minute"
        settings.APP_ENV = orig_env

# ----------------------------------------------------
# 3. I-01 — SECURITY HEADERS TESTS
# ----------------------------------------------------
def test_security_headers(test_db):
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert res.headers["X-XSS-Protection"] == "1; mode=block"
    assert "Content-Security-Policy" in res.headers

# ----------------------------------------------------
# 4. L-01 — OPENXML VALIDATION TESTS
# ----------------------------------------------------
def create_mock_zip(internal_filename: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(internal_filename, "<xml>test</xml>")
    return buf.getvalue()

def test_openxml_validation_docx_xlsx_pptx():
    # Valid DOCX
    docx_bytes = create_mock_zip("word/document.xml")
    doc_type, sha = validate_uploaded_file("test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx_bytes)
    assert doc_type == DocumentTypeEnum.DOCX

    # Valid XLSX
    xlsx_bytes = create_mock_zip("xl/workbook.xml")
    doc_type, sha = validate_uploaded_file("test.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx_bytes)
    assert doc_type == DocumentTypeEnum.XLSX

    # Valid PPTX
    pptx_bytes = create_mock_zip("ppt/presentation.xml")
    doc_type, sha = validate_uploaded_file("test.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptx_bytes)
    assert doc_type == DocumentTypeEnum.PPTX

    # PDF validation regression check
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    doc_type, sha = validate_uploaded_file("test.pdf", "application/pdf", pdf_bytes)
    assert doc_type == DocumentTypeEnum.PDF

def test_openxml_validation_mismatched_and_corrupt():
    # Mismatched structure: DOCX file containing Excel structure
    xlsx_as_docx = create_mock_zip("xl/workbook.xml")
    with pytest.raises(Exception) as exc_info:
        validate_uploaded_file("fake.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx_as_docx)
    assert "Invalid OpenXML file structure" in str(exc_info.value.detail)

    # Malformed ZIP (starts with PK\x03\x04 but corrupted bytes)
    corrupt_zip = b"PK\x03\x04corrupt_zip_bytes_truncated"
    with pytest.raises(Exception) as exc_info:
        validate_uploaded_file("corrupt.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", corrupt_zip)
    assert "Malformed ZIP/OpenXML archive" in str(exc_info.value.detail)
