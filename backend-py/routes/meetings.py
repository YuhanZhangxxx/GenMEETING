"""
Meeting action endpoints:
- POST /api/meetings/{id}/respond   RSVP (accepted / declined / tentative)
- POST /api/meetings/{id}/cancel    Cancel the meeting
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma
from services.google_calendar import (
    respond_to_google_event,
    cancel_google_event,
)
from services.microsoft_calendar import (
    respond_to_outlook_event,
    delete_outlook_event,
)


router = APIRouter()


class RespondRequest(BaseModel):
    response: Literal["accepted", "declined", "tentative"]


class CancelRequest(BaseModel):
    notifyAttendees: bool = True


@router.post("/{event_id}/respond")
async def respond_to_meeting(
    event_id: str,
    body: RespondRequest,
    user: MobileTokenPayload = Depends(require_user),
):
    user_id = user["userId"]

    cached = await prisma.calendareventcache.find_first(
        where={"userId": user_id, "googleEventId": event_id}
    )
    if not cached:
        raise HTTPException(404, "Event not found")

    try:
        if cached.source == "outlook":
            outlook_response = {
                "accepted": "accept",
                "declined": "decline",
                "tentative": "tentativelyAccept",
            }[body.response]
            await respond_to_outlook_event(user_id, event_id, outlook_response)
        else:
            await respond_to_google_event(user_id, event_id, body.response)

        # Update local cache so the next GET /events reflects the new RSVP state.
        await prisma.calendareventcache.update_many(
            where={"userId": user_id, "googleEventId": event_id},
            data={"myResponseStatus": body.response},
        )
        return {"success": True, "response": body.response}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{event_id}/cancel")
async def cancel_meeting(
    event_id: str,
    body: CancelRequest = CancelRequest(),
    user: MobileTokenPayload = Depends(require_user),
):
    user_id = user["userId"]

    cached = await prisma.calendareventcache.find_first(
        where={"userId": user_id, "googleEventId": event_id}
    )
    if not cached:
        raise HTTPException(404, "Event not found")

    try:
        if cached.source == "outlook":
            await delete_outlook_event(user_id, event_id)
        else:
            await cancel_google_event(user_id, event_id)

        # Remove from local cache.
        await prisma.calendareventcache.delete_many(
            where={"userId": user_id, "googleEventId": event_id}
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))
