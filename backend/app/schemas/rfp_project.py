from pydantic import BaseModel, Field, ConfigDict, field_validator, UUID4
from typing import Optional, List
from datetime import datetime
from app.models.rfp_project import ProjectStatusEnum

class RFPProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    reference_number: str = Field(..., min_length=1, max_length=100, description="Reference number unique within org")
    description: Optional[str] = Field(None, max_length=5000)
    customer_name: Optional[str] = Field(None, max_length=255)
    customer_contact: Optional[str] = Field(None, max_length=255)
    submission_deadline: Optional[datetime] = None

    @field_validator("name", "reference_number")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Field cannot be empty or whitespace only")
        return trimmed

class RFPProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    reference_number: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=5000)
    customer_name: Optional[str] = Field(None, max_length=255)
    customer_contact: Optional[str] = Field(None, max_length=255)
    submission_deadline: Optional[datetime] = None
    status: Optional[ProjectStatusEnum] = None

    @field_validator("name", "reference_number")
    @classmethod
    def validate_optional_string(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Field cannot be empty or whitespace only")
            return trimmed
        return v

class RFPProjectResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    created_by_id: UUID4
    name: str
    reference_number: str
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    status: ProjectStatusEnum
    submission_deadline: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RFPProjectListResponse(BaseModel):
    items: List[RFPProjectResponse]
    total: int
    page: int
    page_size: int
    pages: int
