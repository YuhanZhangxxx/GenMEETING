"""
GET /api/ai-advisor

Analyzes the user's upcoming meetings with gpt-4o-mini and returns 3-5
actionable suggestions (reschedule / rsvp / cancel / conflict / info).
Mirrors src/app/api/ai-advisor/route.ts. gpt-4o-mini ONLY — don't upgrade.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma


router = APIRouter()


class Action(BaseModel):
    label: str
    newStartTime: Optional[str] = None
    newEndTime: Optional[str] = None
    response: Optional[str] = None


class Suggestion(BaseModel):
    type: str  # reschedule | rsvp | cancel | conflict | info
    eventId: Optional[str] = None
    eventTitle: Optional[str] = None
    eventStartTime: Optional[str] = None
    message: str
    action: Optional[Action] = None


class AdvisorResponse(BaseModel):
    suggestions: list[Suggestion]


@router.get("", response_model=AdvisorResponse)
async def ai_advisor(user: MobileTokenPayload = Depends(require_user)):
    user_id = user["userId"]

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "sk-...":
        raise HTTPException(
            503,
            "OpenAI API key not configured — set OPENAI_API_KEY and restart.",
        )

    client = AsyncOpenAI(api_key=api_key)

    now = datetime.now(timezone.utc)
    two_weeks = now + timedelta(days=14)

    events = await prisma.calendareventcache.find_many(
        where={"userId": user_id, "startTime": {"gte": now, "lte": two_weeks}},
        order={"startTime": "asc"},
        take=20,
    )

    if not events:
        return AdvisorResponse(suggestions=[])

    # Build the compact event list the model sees.
    event_list = []
    for e in events:
        try:
            attendees_parsed = json.loads(e.attendees or "[]")
        except Exception:
            attendees_parsed = []
        event_list.append(
            {
                "eventId": e.googleEventId,
                "title": e.title,
                "start": e.startTime.strftime("%Y-%m-%d %H:%M"),
                "end": e.endTime.strftime("%Y-%m-%d %H:%M"),
                "startISO": e.startTime.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": e.source,
                "myStatus": e.myResponseStatus or "needsAction",
                "isOrganizer": e.isEditable,
                "attendeeCount": len(attendees_parsed),
            }
        )
    event_map = {e["eventId"]: e for e in event_list}

    lines = [
        f'{i + 1}. id="{e["eventId"]}" | "{e["title"]}" | {e["start"]}–{e["end"]} '
        f'| source:{e["source"]} | myStatus:{e["myStatus"]} '
        f'| {"I am organizer" if e["isOrganizer"] else "I am attendee"} '
        f'| {e["attendeeCount"]} attendees'
        for i, e in enumerate(event_list)
    ]

    prompt = f"""You are a smart meeting assistant. Today is {now.strftime("%A, %B %d, %Y %H:%M")}.

Analyze these upcoming meetings and return 3-5 specific, actionable suggestions.

Meetings:
{chr(10).join(lines)}

Return a JSON object: {{"suggestions": [...]}} where each suggestion has:
- "type": one of "reschedule", "rsvp", "cancel", "conflict", "info"
- "eventId": the exact id string from above (only if related to a specific meeting)
- "eventTitle": the meeting title (only if related to a specific meeting)
- "message": a specific, helpful suggestion in 1-2 sentences
- "action": (optional) if you can suggest a concrete one-click action:
  - "label": short button text (e.g. "Accept", "Decline", "Move to 3pm")
  - For rsvp type: "response" must be "accepted", "declined", or "tentative"
  - For reschedule type: "newStartTime" and "newEndTime" in ISO 8601 format (pick a nearby timeslot that avoids conflicts)

STRICT RULES — only suggest things you can observe from the data above:
- "rsvp": ONLY if myStatus is "needsAction" and I am an attendee (not organizer)
- "conflict": ONLY if two meetings overlap in time
- "reschedule": ONLY if meetings are back-to-back (≤5 min gap) or outside 9am–7pm
- "cancel": ONLY if I am organizer AND attendeeCount is 0
- "info": general scheduling observations (max 1)
- DO NOT suggest adding attendees, writing agendas, or any action you cannot perform via reschedule/rsvp/cancel
- Skip meetings that look fine"""

    try:
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1200,
        )
        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
    except Exception as e:
        msg = str(e)
        if os.getenv("NODE_ENV") != "production":
            print(f"[ai-advisor] OpenAI error: {msg}")
        raise HTTPException(500, msg)

    raw_suggestions = parsed.get("suggestions", []) or []
    suggestions: list[Suggestion] = []
    for s in raw_suggestions:
        event_id = s.get("eventId")
        start_iso = None
        if event_id and event_id in event_map:
            start_iso = event_map[event_id]["startISO"]
        suggestions.append(
            Suggestion(
                type=s.get("type", "info"),
                eventId=event_id,
                eventTitle=s.get("eventTitle"),
                eventStartTime=start_iso,
                message=s.get("message", ""),
                action=Action(**s["action"]) if s.get("action") else None,
            )
        )

    return AdvisorResponse(suggestions=suggestions)
