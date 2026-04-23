"""
GET   /api/notifications          — list the user's 20 most recent notifications
PATCH /api/notifications          — mark notifications as read (body: {"ids": [...]})
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma


router = APIRouter()


class MarkReadRequest(BaseModel):
    ids: list[str]


@router.get("")
async def list_notifications(user: MobileTokenPayload = Depends(require_user)):
    rows = await prisma.notification.find_many(
        where={"userId": user["userId"]},
        order={"createdAt": "desc"},
        take=20,
    )
    return {
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "read": n.read,
                "createdAt": n.createdAt.isoformat().replace("+00:00", "Z"),
            }
            for n in rows
        ]
    }


@router.patch("")
async def mark_read(
    body: MarkReadRequest,
    user: MobileTokenPayload = Depends(require_user),
):
    await prisma.notification.update_many(
        where={"userId": user["userId"], "id": {"in": body.ids}},
        data={"read": True},
    )
    return {"success": True}
