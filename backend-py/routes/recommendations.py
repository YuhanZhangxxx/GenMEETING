"""
GET /api/recommendations?duration=60

Score and return the best time slots for a new meeting. Pulls the user's
cached events as busy blocks and reads their scheduling preferences.
Mirrors src/app/api/recommendations/route.ts.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma
from services.scheduling_engine import (
    find_best_slots,
    BusyBlock,
    UserPreferences,
    BlackoutTime,
)


router = APIRouter()


class SlotDTO(BaseModel):
    start: str
    end: str
    score: int
    reasons: list[str]


class RecommendationsResponse(BaseModel):
    slots: list[SlotDTO]


DEFAULT_PREFS = {
    "workDays": [1, 2, 3, 4, 5],
    "workStart": "09:00",
    "workEnd": "18:00",
    "bufferMinutes": 15,
    "blackoutTimes": [],
    "preferredSlotMinutes": 60,
    "timezone": "UTC",
    "autoReschedule": False,
}


@router.get("", response_model=RecommendationsResponse)
async def get_recommendations(
    duration: int = 60,
    user: MobileTokenPayload = Depends(require_user),
):
    user_id = user["userId"]

    # Load preferences (fall back to defaults).
    pref_row = await prisma.meetingpreference.find_unique(where={"userId": user_id})
    if pref_row:
        try:
            blackouts_raw = json.loads(pref_row.blackoutTimes or "[]")
        except Exception:
            blackouts_raw = []
        prefs = UserPreferences(
            workDays=[int(x) for x in pref_row.workDays.split(",") if x],
            workStart=pref_row.workStart,
            workEnd=pref_row.workEnd,
            bufferMinutes=pref_row.bufferMinutes,
            blackoutTimes=[BlackoutTime(**b) for b in blackouts_raw],
            preferredSlotMinutes=pref_row.preferredSlotMinutes,
            timezone=pref_row.timezone,
            autoReschedule=pref_row.autoReschedule,
        )
    else:
        prefs = UserPreferences(
            **{**DEFAULT_PREFS, "blackoutTimes": []}
        )

    # Load cached events for the next 14 days as busy blocks.
    now = datetime.now(timezone.utc)
    end_window = now + timedelta(days=14)
    events = await prisma.calendareventcache.find_many(
        where={
            "userId": user_id,
            "startTime": {"gte": now},
            "endTime": {"lte": end_window},
        }
    )
    busy_blocks = [BusyBlock(start=e.startTime, end=e.endTime) for e in events]

    slots = find_best_slots(busy_blocks, prefs, duration, days_ahead=14, top_n=3)

    return RecommendationsResponse(
        slots=[
            SlotDTO(
                start=s.start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                end=s.end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                score=s.score,
                reasons=s.reasons,
            )
            for s in slots
        ]
    )
