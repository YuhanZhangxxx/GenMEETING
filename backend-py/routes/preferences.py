"""
GET  /api/preferences — return the user's scheduling preferences (or defaults)
POST /api/preferences — upsert preferences
"""
import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma


router = APIRouter()


class BlackoutTimeDTO(BaseModel):
    day: int
    start: str
    end: str


class UserPreferencesDTO(BaseModel):
    workDays: list[int]
    workStart: str
    workEnd: str
    bufferMinutes: int
    blackoutTimes: list[BlackoutTimeDTO] = []
    preferredSlotMinutes: int
    timezone: str
    autoReschedule: bool = False


class GetResponse(BaseModel):
    preferences: UserPreferencesDTO


DEFAULT_PREFS = UserPreferencesDTO(
    workDays=[1, 2, 3, 4, 5],
    workStart="09:00",
    workEnd="18:00",
    bufferMinutes=15,
    blackoutTimes=[],
    preferredSlotMinutes=60,
    timezone="UTC",
    autoReschedule=False,
)


@router.get("", response_model=GetResponse)
async def get_preferences(user: MobileTokenPayload = Depends(require_user)):
    row = await prisma.meetingpreference.find_unique(where={"userId": user["userId"]})
    if not row:
        return GetResponse(preferences=DEFAULT_PREFS)

    try:
        blackouts = json.loads(row.blackoutTimes or "[]")
    except Exception:
        blackouts = []

    return GetResponse(
        preferences=UserPreferencesDTO(
            workDays=[int(x) for x in row.workDays.split(",") if x],
            workStart=row.workStart,
            workEnd=row.workEnd,
            bufferMinutes=row.bufferMinutes,
            blackoutTimes=[BlackoutTimeDTO(**b) for b in blackouts],
            preferredSlotMinutes=row.preferredSlotMinutes,
            timezone=row.timezone,
            autoReschedule=row.autoReschedule,
        )
    )


@router.post("")
async def save_preferences(
    body: UserPreferencesDTO,
    user: MobileTokenPayload = Depends(require_user),
):
    data: dict[str, Any] = {
        "workDays": ",".join(str(d) for d in body.workDays),
        "workStart": body.workStart,
        "workEnd": body.workEnd,
        "bufferMinutes": body.bufferMinutes,
        "blackoutTimes": json.dumps([b.model_dump() for b in body.blackoutTimes]),
        "preferredSlotMinutes": body.preferredSlotMinutes,
        "timezone": body.timezone,
        "autoReschedule": body.autoReschedule,
    }
    await prisma.meetingpreference.upsert(
        where={"userId": user["userId"]},
        data={
            "create": {"userId": user["userId"], **data},
            "update": data,
        },
    )
    return {"success": True}
