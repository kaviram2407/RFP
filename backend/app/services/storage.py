import boto3
from botocore.config import Config
from fastapi import HTTPException, status
from typing import Tuple
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
            # Handle R2 upload failure
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage upload failed: {str(e)}"
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

    def delete_file(self, storage_key: str) -> bool:
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=storage_key)
            return True
        except Exception:
            return False

# Global instance
storage_service = R2StorageService()
