"""
Meeting action endpoints:
- POST /api/meetings/{id}/respond     RSVP (accepted / declined / tentative)
- POST /api/meetings/{id}/cancel      Cancel the meeting
- POST /api/meetings/{id}/reschedule  Move the meeting to a new time
"""
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma
from services.google_calendar import (
    respond_to_google_event,
    cancel_google_event,
    update_google_event_time,
)
from services.microsoft_calendar import (
    respond_to_outlook_event,
    delete_outlook_event,
    update_outlook_event_time,
)


router = APIRouter()


class RespondRequest(BaseModel):
    response: Literal["accepted", "declined", "tentative"]


class CancelRequest(BaseModel):
    notifyAttendees: bool = True


class RescheduleRequest(BaseModel):
    startTime: str  # ISO
    endTime: str    # ISO


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


@router.post("/{event_id}/reschedule")
async def reschedule_meeting(
    event_id: str,
    body: RescheduleRequest,
    user: MobileTokenPayload = Depends(require_user),
):
    user_id = user["userId"]

    if not body.startTime or not body.endTime:
        raise HTTPException(400, "startTime and endTime required")

    cached = await prisma.calendareventcache.find_first(
        where={"userId": user_id, "googleEventId": event_id}
    )
    if not cached:
        raise HTTPException(404, "Event not found")
    if not cached.isEditable:
        raise HTTPException(403, "Not authorized to edit this event")

    try:
        if cached.source == "outlook":
            await update_outlook_event_time(user_id, event_id, body.startTime, body.endTime)
        else:
            await update_google_event_time(user_id, event_id, body.startTime, body.endTime)

        # Log to RescheduleHistory.
        await prisma.reschedulehistory.create(
            data={
                "userId": user_id,
                "googleEventId": event_id,
                "action": "updated",
                "originalStart": cached.startTime,
                "newStart": datetime.fromisoformat(body.startTime.replace("Z", "+00:00")),
                "newEnd": datetime.fromisoformat(body.endTime.replace("Z", "+00:00")),
                "reason": "Rescheduled by organizer",
            }
        )

        # Invalidate the user's cache so the next /events hit re-syncs.
        await prisma.calendareventcache.delete_many(where={"userId": user_id})

        # Fan out notifications to attendees who have accounts in our system.
        try:
            attendees = json.loads(cached.attendees or "[]")
            emails = [a["email"] for a in attendees if a.get("email")]
            if emails:
                attendee_users = await prisma.user.find_many(
                    where={"email": {"in": emails}}
                )
                if attendee_users:
                    await prisma.notification.create_many(
                        data=[
                            {
                                "userId": u.id,
                                "type": "meeting_updated",
                                "title": f"Meeting rescheduled: {cached.title}",
                                "body": f"Moved to {body.startTime}",
                                "relatedId": event_id,
                            }
                            for u in attendee_users
                        ]
                    )
        except Exception:
            # Notification fan-out is best-effort; don't block the reschedule.
            pass

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
