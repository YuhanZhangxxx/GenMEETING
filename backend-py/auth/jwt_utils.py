"""
JWT sign/verify — mirrors src/lib/mobile-auth.ts on the Next.js side:
- Algorithm: HS256
- Secret: the same NEXTAUTH_SECRET
- Payload: { userId, email, iat, exp }
- Expiry: 30 days

Keeps tokens interchangeable — a JWT signed by Next.js is accepted here, and vice versa.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import TypedDict, Optional

from jose import jwt, JWTError


SECRET = os.getenv("NEXTAUTH_SECRET") or "dev-secret-change-in-production"
ALGORITHM = "HS256"
EXPIRE_DAYS = 30


class MobileTokenPayload(TypedDict):
    userId: str
    email: str


def sign_mobile_jwt(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def verify_mobile_jwt(token: str) -> Optional[MobileTokenPayload]:
    try:
        decoded = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = decoded.get("userId")
        email = decoded.get("email")
        if isinstance(user_id, str) and isinstance(email, str):
            return {"userId": user_id, "email": email}
        return None
    except JWTError:
        return None
