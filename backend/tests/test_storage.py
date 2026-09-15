import pytest
import os
import shutil
import tempfile
import io
import uuid
import fitz
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.services.storage import (
    LocalStorageService,
    R2StorageService,
    get_storage_service,
    validate_uploaded_file,
)
from app.services import rfp_document as doc_service
from app.services import document_processing as processing_service
from app.models.rfp_document import RFPDocument, DocumentVersion, ProcessingStatusEnum
from tests.test_documents import doc_db, get_token

@pytest.fixture
def temp_storage_dir():
    temp_dir = tempfile.mkdtemp(prefix="test_storage_")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_local_storage_crud(temp_storage_dir):
    service = LocalStorageService(storage_dir=temp_storage_dir)
    storage_key = "organizations/org-123/rfp-projects/proj-456/documents/doc-1/versions/ver-1"
    content = b"%PDF-1.4\nSample PDF Content for Local Storage Test"

    # 1. Upload
    assert service.upload_file_bytes(storage_key, content, "application/pdf") is True

    # 2. Check Existence
    assert service.file_exists(storage_key) is True

    # 3. Retrieve Bytes
    retrieved_bytes = service.get_file_bytes(storage_key)
    assert retrieved_bytes == content

    # 4. Generate Local Presigned URL
    download_url = service.generate_presigned_download_url(storage_key)
    assert download_url == f"/api/v1/storage/files/{storage_key}"

    # 5. Delete File
    assert service.delete_file(storage_key) is True
    assert service.file_exists(storage_key) is False

def test_path_traversal_protection(temp_storage_dir):
    service = LocalStorageService(storage_dir=temp_storage_dir)

    malicious_keys = [
        "../../etc/passwd",
        "../sensitive.txt",
        "folder/../../outside.txt",
        "/etc/shadow",
        "\\Windows\\System32",
    ]

    for key in malicious_keys:
        with pytest.raises(HTTPException) as exc_info:
            service.upload_file_bytes(key, b"malicious payload", "text/plain")
        assert exc_info.value.status_code == 400
        assert "path traversal detected" in exc_info.value.detail.lower()

        with pytest.raises(HTTPException) as exc_info:
            service.get_file_bytes(key)
        assert exc_info.value.status_code == 400
        assert "path traversal detected" in exc_info.value.detail.lower()

def test_provider_selection():
    # Test local provider selection
    local_service = get_storage_service(provider="local")
    assert isinstance(local_service, LocalStorageService)

    # Test r2 provider selection
    r2_service = get_storage_service(provider="r2")
    assert isinstance(r2_service, R2StorageService)

    # Test invalid provider selection
    with pytest.raises(HTTPException) as exc_info:
        get_storage_service(provider="invalid_provider")
    assert exc_info.value.status_code == 500
    assert "Unsupported STORAGE_PROVIDER" in exc_info.value.detail

def test_rfp_document_workflow_with_local_storage(doc_db, temp_storage_dir):
    local_service = LocalStorageService(storage_dir=temp_storage_dir)

    # Create valid PDF with text content
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Local storage workflow test text content")
    pdf_bytes = doc.tobytes()
    doc.close()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.rfp_document.storage_service", local_service)
        mp.setattr("app.services.document_processing.storage_service", local_service)
        mp.setattr("app.api.routes.storage.storage_service", local_service)

        client = TestClient(app)
        token = get_token(client, "product_a@orga.com")
        proj_id = doc_db["projA"].id

        # 1. Upload RFP Document
        res_upload = client.post(
            f"/api/v1/rfp-projects/{proj_id}/documents",
            files={"file": ("local_test_doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res_upload.status_code == 201
        doc_data = res_upload.json()
        assert doc_data["name"] == "local_test_doc.pdf"
        doc_id = doc_data["id"]
        ver_id = doc_data["current_version"]["id"]

        db = doc_db["db"]
        ver_record = db.query(DocumentVersion).filter(DocumentVersion.id == uuid.UUID(ver_id)).first()
        assert ver_record is not None
        storage_key = ver_record.storage_key

        # Verify physical file existence in local storage directory
        assert local_service.file_exists(storage_key) is True

        # 2. Download Presigned URL
        res_dl = client.get(
            f"/api/v1/rfp-projects/{proj_id}/documents/{doc_id}/download",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res_dl.status_code == 200
        dl_url = res_dl.json()["download_url"]
        assert dl_url == f"/api/v1/storage/files/{storage_key}"

        # 3. Direct Local Download API
        res_file = client.get(
            dl_url,
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res_file.status_code == 200
        assert res_file.content == pdf_bytes

        # 4. Trigger Processing using local file
        res_proc = processing_service.process_document_version(db, uuid.UUID(ver_id))
        assert res_proc.processing_status == ProcessingStatusEnum.COMPLETED
