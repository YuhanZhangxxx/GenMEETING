"""
FastAPI 的鉴权 Dependency。每个需要登录的端点写 user = Depends(require_user) 就行。
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
    """必须登录的端点用这个。拿不到合法 token 就 401。"""
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
    """不强制登录的端点用这个，没 token 返回 None。"""
    token = _extract_bearer(authorization)
    if not token:
        return None
    return verify_mobile_jwt(token)
