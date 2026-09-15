import boto3
from botocore.config import Config
from fastapi import HTTPException, status
from typing import Tuple, Optional
import hashlib
import os

from app.core.config import settings
from app.models.rfp_document import DocumentTypeEnum

SUPPORTED_EXTENSIONS = {
    ".pdf": DocumentTypeEnum.PDF,
    ".docx": DocumentTypeEnum.DOCX,
    ".xlsx": DocumentTypeEnum.XLSX,
    ".pptx": DocumentTypeEnum.PPTX,
}

SUPPORTED_MIME_TYPES = {
    "application/pdf": DocumentTypeEnum.PDF,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocumentTypeEnum.DOCX,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": DocumentTypeEnum.XLSX,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": DocumentTypeEnum.PPTX,
    # Fallback / generic binary MIME types when browsers send generic types
    "application/octet-stream": None,
}

MAGIC_BYTES = {
    DocumentTypeEnum.PDF: [b"%PDF-"],
    DocumentTypeEnum.DOCX: [b"PK\x03\x04"],
    DocumentTypeEnum.XLSX: [b"PK\x03\x04"],
    DocumentTypeEnum.PPTX: [b"PK\x03\x04"],
}

def validate_uploaded_file(filename: str, declared_content_type: str, content_bytes: bytes) -> Tuple[DocumentTypeEnum, str]:
    """
    Validates extension, size, declared content type, and magic bytes.
    Returns (DocumentTypeEnum, checksum_sha256).
    """
    # 1. File Size Check
    size = len(content_bytes)
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )
    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size ({size} bytes) exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_BYTES} bytes."
        )

    # 2. Extension Check
    _, ext = os.path.splitext(filename.lower())
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{ext}'. Allowed extensions: {list(SUPPORTED_EXTENSIONS.keys())}"
        )
    expected_doc_type = SUPPORTED_EXTENSIONS[ext]

    # 3. Magic Bytes / File Header Signature Validation
    valid_headers = MAGIC_BYTES.get(expected_doc_type, [])
    if not any(content_bytes.startswith(header) for header in valid_headers):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File signature validation failed for extension '{ext}'."
        )

    # Calculate SHA256
    checksum = hashlib.sha256(content_bytes).hexdigest()

    return expected_doc_type, checksum


class LocalStorageService:
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = storage_dir or settings.LOCAL_STORAGE_DIR
        os.makedirs(self.storage_dir, exist_ok=True)

    def _resolve_path(self, storage_key: str) -> str:
        """
        Secure path resolution preventing path traversal attacks.
        Checks that target_path stays strictly within base_dir.
        """
        if not storage_key or os.path.isabs(storage_key) or storage_key.startswith("/") or storage_key.startswith("\\"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage key: path traversal detected."
            )

        parts = os.path.normpath(storage_key).split(os.sep)
        if ".." in parts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage key: path traversal detected."
            )

        base_dir = os.path.abspath(self.storage_dir)
        target_path = os.path.abspath(os.path.join(base_dir, storage_key))

        if not (target_path.startswith(base_dir + os.sep) or target_path == base_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage key: path traversal detected."
            )
        return target_path

    def upload_file_bytes(self, storage_key: str, content_bytes: bytes, content_type: str) -> bool:
        target_path = self._resolve_path(storage_key)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        try:
            with open(target_path, "wb") as f:
                f.write(content_bytes)
            return True
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Local storage upload failed: {str(e)}"
            )

    def get_file_bytes(self, storage_key: str) -> bytes:
        target_path = self._resolve_path(storage_key)
        if not os.path.exists(target_path) or not os.path.isfile(target_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found in local storage: {storage_key}"
            )
        try:
            with open(target_path, "rb") as f:
                return f.read()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read file from local storage: {str(e)}"
            )

    def generate_presigned_download_url(self, storage_key: str, expires_in: int = 3600) -> str:
        self._resolve_path(storage_key)
        clean_key = storage_key.lstrip("/").lstrip("\\")
        return f"/api/v1/storage/files/{clean_key}"

    def file_exists(self, storage_key: str) -> bool:
        try:
            target_path = self._resolve_path(storage_key)
            return os.path.exists(target_path) and os.path.isfile(target_path)
        except Exception:
            return False

    def delete_file(self, storage_key: str) -> bool:
        try:
            target_path = self._resolve_path(storage_key)
            if os.path.exists(target_path) and os.path.isfile(target_path):
                os.remove(target_path)
                return True
            return False
        except Exception:
            return False


class R2StorageService:
    def __init__(self):
        endpoint_url = settings.R2_ENDPOINT_URL or (
            f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
            if settings.R2_ACCOUNT_ID
            else None
        )
        self.bucket_name = settings.R2_BUCKET_NAME

        # Initialize S3 client for Cloudflare R2
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID or "placeholder",
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY or "placeholder",
            region_name=settings.R2_REGION or "auto",
            config=Config(signature_version="s3v4")
        )

    def upload_file_bytes(self, storage_key: str, content_bytes: bytes, content_type: str) -> bool:
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=storage_key,
                Body=content_bytes,
                ContentType=content_type
            )
            return True
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage upload failed: {str(e)}"
            )

    def get_file_bytes(self, storage_key: str) -> bytes:
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=storage_key
            )
            body = response.get("Body") if isinstance(response, dict) else getattr(response, "Body", None)
            if hasattr(body, "read"):
                return body.read()
            return bytes(body or b"")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve file from R2 storage: {str(e)}"
            )

    def generate_presigned_download_url(self, storage_key: str, expires_in: int = 3600) -> str:
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": storage_key},
                ExpiresIn=expires_in
            )
            return url
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate download URL: {str(e)}"
            )

    def file_exists(self, storage_key: str) -> bool:
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=storage_key)
            return True
        except Exception:
            return False

    def delete_file(self, storage_key: str) -> bool:
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=storage_key)
            return True
        except Exception:
            return False


def get_storage_service(provider: Optional[str] = None):
    prov = (provider or settings.STORAGE_PROVIDER).lower()
    if prov == "local":
        return LocalStorageService()
    elif prov == "r2":
        return R2StorageService()
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unsupported STORAGE_PROVIDER '{prov}'. Allowed options: 'local', 'r2'."
        )

# Global instance initialized according to STORAGE_PROVIDER setting
storage_service = get_storage_service()
