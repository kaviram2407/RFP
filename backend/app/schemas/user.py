from pydantic import BaseModel, EmailStr, UUID4
from datetime import datetime
from app.models.user import RoleEnum

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True
    role: RoleEnum
    organization_id: UUID4

class UserResponse(UserBase):
    id: UUID4
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
