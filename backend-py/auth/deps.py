"""
FastAPI auth dependencies. Protected endpoints add `user = Depends(require_user)`.
"""
from typing import Optional

from fastapi import Header, HTTPException, status

from auth.jwt_utils import verify_mobile_jwt, MobileTokenPayload


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip()


def require_user(authorization: Optional[str] = Header(None)) -> MobileTokenPayload:
    """Use on endpoints that require login. Returns 401 if no valid token."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_mobile_jwt(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def optional_user(authorization: Optional[str] = Header(None)) -> Optional[MobileTokenPayload]:
    """Use on endpoints where auth is optional — returns None if no token."""
    token = _extract_bearer(authorization)
    if not token:
        return None
    return verify_mobile_jwt(token)
