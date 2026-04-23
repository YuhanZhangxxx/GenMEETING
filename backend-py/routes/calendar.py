"""
Calendar endpoints:
- GET  /api/calendar/events        List events for the next 14 days (cached, 5-min TTL)
- POST /api/calendar/create-event  Create an event on the user's primary calendar
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma
from services.google_calendar import fetch_google_events, create_google_event
from services.microsoft_calendar import fetch_outlook_events, create_outlook_event


router = APIRouter()

CACHE_TTL_SECONDS = 5 * 60


# ─── Pydantic models ─────────────────────────────────────────────────────────

class AttendeeDTO(BaseModel):
    email: str = ""
    responseStatus: str = "needsAction"
    self: bool = False


class EventDTO(BaseModel):
    id: str
    googleEventId: str
    source: str
    title: str
    startTime: str
    endTime: str
    allDay: bool
    isEditable: bool
    isOrganizer: bool
    canEdit: bool
    canCancel: bool
    canRespond: bool
    canRequestChange: bool
    organizerEmail: Optional[str] = None
    attendees: list[AttendeeDTO]
    myResponseStatus: Optional[str] = None
    meetingLink: Optional[str] = None
    userEmail: str


class EventsResponse(BaseModel):
    events: list[EventDTO]
    fromCache: bool = False
    syncErrors: Optional[list[str]] = None


class CreateEventRequest(BaseModel):
    title: str
    startTime: str  # ISO timestamp
    endTime: str
    description: Optional[str] = None
    attendees: Optional[list[str]] = None
    addMeetLink: bool = False
    provider: Literal["google", "microsoft"] = "google"


class CreateEventResponse(BaseModel):
    eventId: str
    htmlLink: Optional[str] = None
    meetLink: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _map_outlook_response(r: Optional[str]) -> str:
    if r == "accepted":
        return "accepted"
    if r == "declined":
        return "declined"
    if r == "tentativelyAccepted":
        return "tentative"
    return "needsAction"


def _to_dto(event: Any, user_email: str) -> EventDTO:
    is_organizer = event.isEditable
    try:
        attendees_raw = json.loads(event.attendees or "[]")
    except Exception:
        attendees_raw = []
    # Whitelist only fields the DTO accepts so stray data doesn't blow it up.
    attendees_clean = []
    for a in attendees_raw:
        if not isinstance(a, dict):
            continue
        attendees_clean.append(
            AttendeeDTO(
                email=str(a.get("email") or ""),
                responseStatus=str(a.get("responseStatus") or "needsAction"),
                self=bool(a.get("self", False)),
            )
        )
    return EventDTO(
        id=event.id,
        googleEventId=event.googleEventId,
        source=event.source,
        title=event.title,
        startTime=event.startTime.isoformat().replace("+00:00", "Z"),
        endTime=event.endTime.isoformat().replace("+00:00", "Z"),
        allDay=event.allDay,
        isEditable=event.isEditable,
        isOrganizer=is_organizer,
        canEdit=is_organizer,
        canCancel=is_organizer,
        canRespond=not is_organizer,
        canRequestChange=not is_organizer,
        organizerEmail=event.organizerEmail,
        attendees=attendees_clean,
        myResponseStatus=event.myResponseStatus,
        meetingLink=event.meetingLink,
        userEmail=user_email,
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/events", response_model=EventsResponse)
async def get_events(user: MobileTokenPayload = Depends(require_user)):
    user_id = user["userId"]
    user_email = user["email"] or ""

    # 1. Check cache freshness.
    latest = await prisma.calendareventcache.find_first(
        where={"userId": user_id},
        order={"fetchedAt": "desc"},
    )
    now = datetime.now(timezone.utc)
    if latest:
        fetched_at = latest.fetchedAt
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        if (now - fetched_at).total_seconds() < CACHE_TTL_SECONDS:
            cached = await prisma.calendareventcache.find_many(
                where={"userId": user_id, "startTime": {"gte": now}},
                order={"startTime": "asc"},
            )
            return EventsResponse(
                events=[_to_dto(e, user_email) for e in cached],
                fromCache=True,
            )

    # 2. Figure out which providers the user has linked.
    accounts = await prisma.account.find_many(where={"userId": user_id})
    has_google = any(a.provider == "google" for a in accounts)
    has_ms = any(a.provider == "microsoft" for a in accounts)

    errors: list[str] = []

    # 3. Sync Google.
    if has_google:
        try:
            items = await fetch_google_events(user_id, 14)
            for it in items:
                if not it.get("id"):
                    continue
                start = it.get("start", {}).get("dateTime") or it.get("start", {}).get("date")
                end = it.get("end", {}).get("dateTime") or it.get("end", {}).get("date")
                if not start or not end:
                    continue
                all_day = not it.get("start", {}).get("dateTime")
                organizer_email = (it.get("organizer") or {}).get("email", "")
                is_organizer = (it.get("organizer") or {}).get("self") is True
                attendees = [
                    {
                        "email": a.get("email", ""),
                        "responseStatus": a.get("responseStatus", "needsAction"),
                        "self": a.get("self", False),
                    }
                    for a in (it.get("attendees") or [])
                ]
                my_attendee = next((a for a in attendees if a["self"]), None)
                meeting_link = it.get("hangoutLink")
                if not meeting_link:
                    for ep in (it.get("conferenceData") or {}).get("entryPoints") or []:
                        if ep.get("entryPointType") == "video":
                            meeting_link = ep.get("uri")
                            break

                data = {
                    "title": it.get("summary") or "(No title)",
                    "startTime": start,
                    "endTime": end,
                    "allDay": all_day,
                    "isEditable": is_organizer,
                    "organizerEmail": organizer_email,
                    "attendees": json.dumps(attendees),
                    "myResponseStatus": my_attendee["responseStatus"] if my_attendee else None,
                    "meetingLink": meeting_link,
                    "fetchedAt": now,
                }
                await prisma.calendareventcache.upsert(
                    where={"userId_googleEventId": {"userId": user_id, "googleEventId": it["id"]}},
                    data={
                        "create": {
                            "userId": user_id,
                            "googleEventId": it["id"],
                            "source": "google",
                            **data,
                        },
                        "update": data,
                    },
                )
        except Exception as e:
            msg = str(e)
            auth_err = any(
                s in msg for s in (
                    "insufficientPermissions", "Invalid Credentials",
                    "No Google account", "No access token",
                )
            )
            errors.append("calendar_access_denied:google" if auth_err else f"google:{msg}")

    # 4. Sync Microsoft.
    if has_ms:
        try:
            items = await fetch_outlook_events(user_id, 14)
            for it in items:
                if not it.get("id"):
                    continue
                start_raw = it["start"]["dateTime"]
                end_raw = it["end"]["dateTime"]
                # Graph returns timestamps without timezone suffix — treat UTC as Z.
                if it["start"].get("timeZone") == "UTC" and not start_raw.endswith("Z"):
                    start_raw += "Z"
                if it["end"].get("timeZone") == "UTC" and not end_raw.endswith("Z"):
                    end_raw += "Z"

                organizer_email = (it.get("organizer") or {}).get("emailAddress", {}).get("address", "")
                attendees = []
                for a in (it.get("attendees") or []):
                    addr = (a.get("emailAddress") or {}).get("address", "")
                    attendees.append({
                        "email": addr,
                        "responseStatus": _map_outlook_response(
                            (a.get("status") or {}).get("response")
                        ),
                        "self": addr.lower() == user_email.lower(),
                    })
                my_attendee = next((a for a in attendees if a["self"]), None)
                meeting_link = (it.get("onlineMeeting") or {}).get("joinUrl")

                data = {
                    "title": it.get("subject") or "(No title)",
                    "startTime": start_raw,
                    "endTime": end_raw,
                    "allDay": False,
                    "isEditable": it.get("isOrganizer", False),
                    "organizerEmail": organizer_email,
                    "attendees": json.dumps(attendees),
                    "myResponseStatus": my_attendee["responseStatus"] if my_attendee else None,
                    "meetingLink": meeting_link,
                    "fetchedAt": now,
                }
                await prisma.calendareventcache.upsert(
                    where={"userId_googleEventId": {"userId": user_id, "googleEventId": it["id"]}},
                    data={
                        "create": {
                            "userId": user_id,
                            "googleEventId": it["id"],
                            "source": "outlook",
                            **data,
                        },
                        "update": data,
                    },
                )
        except Exception as e:
            errors.append(f"microsoft:{str(e)}")

    # 5. If every error is a Google auth error, signal the UI to ask for re-consent.
    if errors and all(e == "calendar_access_denied:google" for e in errors):
        raise HTTPException(403, "calendar_access_denied")

    events = await prisma.calendareventcache.find_many(
        where={"userId": user_id, "startTime": {"gte": now}},
        order={"startTime": "asc"},
    )
    return EventsResponse(
        events=[_to_dto(e, user_email) for e in events],
        fromCache=False,
        syncErrors=errors or None,
    )


@router.post("/create-event", response_model=CreateEventResponse)
async def create_event(
    body: CreateEventRequest,
    user: MobileTokenPayload = Depends(require_user),
):
    user_id = user["userId"]

    if body.provider == "google":
        created = await create_google_event(
            user_id=user_id,
            title=body.title,
            start_time=body.startTime,
            end_time=body.endTime,
            description=body.description,
            attendees=body.attendees,
            add_meet_link=body.addMeetLink,
        )
        # Invalidate cache so the next GET /events re-syncs and picks this up.
        await prisma.calendareventcache.delete_many(where={"userId": user_id})
        return CreateEventResponse(
            eventId=created.get("id", ""),
            htmlLink=created.get("htmlLink"),
            meetLink=created.get("hangoutLink"),
        )
    else:
        created = await create_outlook_event(
            user_id=user_id,
            title=body.title,
            start_time=body.startTime,
            end_time=body.endTime,
            description=body.description,
            attendees=body.attendees,
            add_meet_link=body.addMeetLink,
        )
        await prisma.calendareventcache.delete_many(where={"userId": user_id})
        meet = (created.get("onlineMeeting") or {}).get("joinUrl")
        return CreateEventResponse(
            eventId=created.get("id", ""),
            htmlLink=created.get("webLink"),
            meetLink=meet,
        )
