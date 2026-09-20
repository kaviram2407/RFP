from datetime import datetime, timedelta, timezone
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.rate_limit import rate_limit_dependency
from app.core.redis import revoke_jti
from app.models.user import User
from app.schemas.auth import Token
from app.schemas.user import UserResponse

router = APIRouter()

login_rate_limiter = rate_limit_dependency("login", "RATE_LIMIT_LOGIN")

@router.post("/login", response_model=Token, dependencies=[Depends(login_rate_limiter)])
def login_access_token(
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests.
    Using email as username.
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        token_type="bearer",
    )

@router.post("/logout")
def logout(
    current_user: User = Depends(deps.get_current_user),
    token: str = Depends(deps.oauth2_scheme)
):
    """
    Log out current user and revoke access token server-side.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            now_ts = datetime.now(timezone.utc).timestamp()
            remaining_ttl = int(exp - now_ts)
            if remaining_ttl > 0:
                revoke_jti(jti, remaining_ttl)
    except Exception:
        pass

    return {"message": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
def read_users_me(
    current_user: User = Depends(deps.get_current_user),
) -> UserResponse:
    """
    Get current user.
    """
    return current_user

