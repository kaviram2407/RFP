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
from app.models.rfp_project import RFPProject, ProjectStatusEnum
from app.models.rfp_document import RFPDocument, DocumentVersion
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
def doc_db():
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

    projA = RFPProject(
        name="Project A",
        reference_number="REF-A",
        organization_id=orgA.id,
        created_by_id=user_product_a.id,
    )
    projB = RFPProject(
        name="Project B",
        reference_number="REF-B",
        organization_id=orgB.id,
        created_by_id=user_product_b.id,
    )
    db.add_all([projA, projB])
    db.commit()

    yield {
        "db": db,
        "orgA": orgA,
        "orgB": orgB,
        "product_a": user_product_a,
        "vp_a": user_vp_a,
        "product_b": user_product_b,
        "projA": projA,
        "projB": projB,
    }
    db.close()

def get_token(client: TestClient, email: str):
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"}
    )
    return response.json()["access_token"]

# Sample valid binary payloads
VALID_PDF_BYTES = b"%PDF-1.4\n%...\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
VALID_DOCX_BYTES = b"PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00"

@patch("app.services.rfp_document.storage_service")
def test_upload_document_success(mock_storage, doc_db):
    mock_storage.upload_file_bytes.return_value = True

    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")
    proj_id = doc_db["projA"].id

    response = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("rfp_spec.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "rfp_spec.pdf"
    assert data["document_type"] == "PDF"
    assert data["status"] == "ACTIVE"
    assert data["current_version"]["version_number"] == 1
    assert data["current_version"]["original_filename"] == "rfp_spec.pdf"

    # Verify R2 upload call
    mock_storage.upload_file_bytes.assert_called_once()
    storage_key = mock_storage.upload_file_bytes.call_args[0][0]
    assert f"organizations/{doc_db['orgA'].id}/rfp-projects/{proj_id}/documents/" in storage_key

@patch("app.services.rfp_document.storage_service")
def test_upload_document_invalid_extension(mock_storage, doc_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")
    proj_id = doc_db["projA"].id

    response = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("malicious.exe", io.BytesIO(b"MZ123"), "application/x-msdownload")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 400
    assert "Unsupported file extension" in response.json()["detail"]

@patch("app.services.rfp_document.storage_service")
def test_upload_document_signature_validation_failure(mock_storage, doc_db):
    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")
    proj_id = doc_db["projA"].id

    # Fake PDF (text payload instead of %PDF-)
    fake_pdf = b"This is plain text pretending to be a PDF"
    response = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("fake.pdf", io.BytesIO(fake_pdf), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 400
    assert "File signature validation failed" in response.json()["detail"]

@patch("app.services.rfp_document.storage_service")
def test_upload_new_version(mock_storage, doc_db):
    mock_storage.upload_file_bytes.return_value = True

    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")
    proj_id = doc_db["projA"].id

    # Initial upload v1
    res1 = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("spec_v1.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    doc_id = res1.json()["id"]

    # Upload v2
    res2 = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents/{doc_id}/versions",
        files={"file": ("spec_v2.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["current_version"]["version_number"] == 2
    assert data2["current_version"]["original_filename"] == "spec_v2.pdf"

    # Verify versions list
    res_versions = client.get(
        f"/api/v1/rfp-projects/{proj_id}/documents/{doc_id}/versions",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_versions.status_code == 200
    versions = res_versions.json()
    assert len(versions) == 2
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1

def test_rbac_restrictions_on_documents(doc_db):
    client = TestClient(app)
    token_vp = get_token(client, "vp_a@orga.com")
    proj_id = doc_db["projA"].id

    # VP attempt to upload -> 403 Forbidden
    response = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("test.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token_vp}"}
    )
    assert response.status_code == 403

def test_tenant_isolation_on_documents(doc_db):
    client = TestClient(app)
    token_b = get_token(client, "product_b@orgb.com")
    proj_id_a = doc_db["projA"].id

    # Product Team B tries to upload to Org A's project -> 404 Not Found
    response = client.post(
        f"/api/v1/rfp-projects/{proj_id_a}/documents",
        files={"file": ("attack.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert response.status_code == 404

@patch("app.services.rfp_document.storage_service")
def test_download_presigned_url(mock_storage, doc_db):
    mock_storage.upload_file_bytes.return_value = True
    mock_storage.generate_presigned_download_url.return_value = "https://r2.cloudflarestorage.com/signed-test-url"

    client = TestClient(app)
    token = get_token(client, "product_a@orga.com")
    proj_id = doc_db["projA"].id

    res_upload = client.post(
        f"/api/v1/rfp-projects/{proj_id}/documents",
        files={"file": ("doc.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    doc_id = res_upload.json()["id"]

    res_dl = client.get(
        f"/api/v1/rfp-projects/{proj_id}/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_dl.status_code == 200
    assert res_dl.json()["download_url"] == "https://r2.cloudflarestorage.com/signed-test-url"
