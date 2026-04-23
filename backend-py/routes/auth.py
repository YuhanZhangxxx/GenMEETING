"""
POST /api/auth/mobile-token

Mobile login entry point: exchange a provider (Google/Microsoft) access_token for
our own JWT. Mirrors src/app/api/auth/mobile-token/route.ts on the Next.js side.
"""
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth.jwt_utils import sign_mobile_jwt
from db import prisma


router = APIRouter()


class MobileTokenRequest(BaseModel):
    provider: Literal["google", "microsoft"]
    accessToken: str
    refreshToken: Optional[str] = None


class UserDTO(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    image: Optional[str] = None


class MobileTokenResponse(BaseModel):
    token: str
    user: UserDTO


async def _verify_google_token(access_token: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid Google access token")
    info = resp.json()
    return {
        "email": info.get("email"),
        "name": info.get("name"),
        "image": info.get("picture"),
        "providerAccountId": info.get("sub"),
    }


async def _verify_microsoft_token(access_token: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid Microsoft access token")
    info = resp.json()
    return {
        "email": info.get("mail") or info.get("userPrincipalName"),
        "name": info.get("displayName"),
        "image": None,
        "providerAccountId": info.get("id"),
    }


@router.post("/mobile-token", response_model=MobileTokenResponse)
async def mobile_token(body: MobileTokenRequest):
    # 1. Verify the provider's access_token and pull the user's profile.
    if body.provider == "google":
        info = await _verify_google_token(body.accessToken)
    else:
        info = await _verify_microsoft_token(body.accessToken)

    email = info["email"]
    if not email:
        raise HTTPException(400, "Could not retrieve email from provider")

    # 2. Find or create the user.
    user = await prisma.user.find_unique(where={"email": email})
    if not user:
        user = await prisma.user.create(
            data={
                "email": email,
                "name": info.get("name"),
                "image": info.get("image"),
            }
        )

    # 3. Upsert the Account record so calendar services can find fresh tokens.
    provider_account_id = info["providerAccountId"]
    existing = await prisma.account.find_unique(
        where={
            "provider_providerAccountId": {
                "provider": body.provider,
                "providerAccountId": provider_account_id,
            }
        }
    )
    if existing:
        update_data: dict = {"access_token": body.accessToken}
        if body.refreshToken:
            update_data["refresh_token"] = body.refreshToken
        await prisma.account.update(where={"id": existing.id}, data=update_data)
    else:
        scope = (
            "openid email profile https://www.googleapis.com/auth/calendar"
            if body.provider == "google"
            else "openid email profile User.Read Calendars.ReadWrite"
        )
        await prisma.account.create(
            data={
                "userId": user.id,
                "type": "oauth",
                "provider": body.provider,
                "providerAccountId": provider_account_id,
                "access_token": body.accessToken,
                "refresh_token": body.refreshToken,
                "token_type": "Bearer",
                "scope": scope,
            }
        )

    # 4. Sign our own JWT and return it.
    token = sign_mobile_jwt(user.id, user.email or "")

    return MobileTokenResponse(
        token=token,
        user=UserDTO(
            id=user.id,
            email=user.email,
            name=user.name,
            image=user.image,
        ),
    )
