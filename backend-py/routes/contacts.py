"""
GET /api/contacts — list the user's favorite contacts.
(Mobile only reads; POST/DELETE not ported since mobile doesn't use them.)
"""
from fastapi import APIRouter, Depends

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma


router = APIRouter()


@router.get("")
async def list_contacts(user: MobileTokenPayload = Depends(require_user)):
    rows = await prisma.favoritecontact.find_many(
        where={"userId": user["userId"]},
        order={"name": "asc"},
    )
    return {
        "contacts": [
            {"id": c.id, "email": c.email, "name": c.name}
            for c in rows
        ]
    }
