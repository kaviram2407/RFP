from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from app.api import deps
from app.models.user import User
from app.services.storage import storage_service, LocalStorageService

router = APIRouter()

@router.get(
    "/storage/files/{storage_key:path}",
    summary="Download local storage file",
)
def download_local_file(
    storage_key: str,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Download a file from local storage.
    Accessible to all authenticated users.
    Enforces path traversal protection via LocalStorageService.
    """
    if not isinstance(storage_service, LocalStorageService):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct local file download endpoint is only active when STORAGE_PROVIDER=local."
        )

    target_path = storage_service._resolve_path(storage_key)
    if not os.path.exists(target_path) or not os.path.isfile(target_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in local storage."
        )

    return FileResponse(path=target_path)
