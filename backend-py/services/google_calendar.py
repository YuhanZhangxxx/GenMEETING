"""
Google Calendar service — mirrors src/lib/google-calendar.ts.

Responsibilities:
- Fetch the user's Google access_token, refresh it when expired, and write it back.
- Build an authenticated Calendar API client.
- List / create / patch / RSVP / delete events.
"""
import os
import time
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from db import prisma


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
TOKEN_URI = "https://oauth2.googleapis.com/token"


async def get_valid_access_token(user_id: str) -> str:
    """Return a usable access_token, refreshing and persisting it if it's near expiry."""
    account = await prisma.account.find_first(
        where={"userId": user_id, "provider": "google"}
    )
    if not account:
        raise RuntimeError("No Google account linked for this user.")
    if not account.access_token:
        raise RuntimeError("No access token found.")

    now = int(time.time())
    is_expired = account.expires_at is not None and account.expires_at < now + 60

    if not is_expired:
        return account.access_token

    # Needs refresh.
    if not account.refresh_token:
        raise RuntimeError("No refresh token available.")

    creds = Credentials(
        token=account.access_token,
        refresh_token=account.refresh_token,
        token_uri=TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    creds.refresh(Request())

    new_token = creds.token
    new_expires_at = int(creds.expiry.timestamp()) if creds.expiry else account.expires_at

    await prisma.account.update(
        where={"id": account.id},
        data={
            "access_token": new_token,
            "expires_at": new_expires_at,
        },
    )
    return new_token


async def get_calendar_client(user_id: str):
    """Authenticated Google Calendar v3 client."""
    access_token = await get_valid_access_token(user_id)
    creds = Credentials(
        token=access_token,
        token_uri=TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    # cache_discovery=False silences a noisy warning on Windows.
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


async def fetch_google_events(user_id: str, days_ahead: int = 14) -> list:
    """Fetch events from the user's primary calendar for the next N days."""
    from datetime import datetime, timedelta, timezone

    service = await get_calendar_client(user_id)
    time_min = datetime.now(timezone.utc).isoformat()
    time_max = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat()

    resp = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=200,
        )
        .execute()
    )
    return resp.get("items", [])


async def create_google_event(
    user_id: str,
    title: str,
    start_time: str,
    end_time: str,
    description: Optional[str] = None,
    attendees: Optional[list[str]] = None,
    add_meet_link: bool = False,
) -> dict:
    """Create a calendar event. If add_meet_link is True, a Google Meet link is attached."""
    service = await get_calendar_client(user_id)

    body: dict = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_time},
        "end": {"dateTime": end_time},
    }
    if attendees:
        body["attendees"] = [{"email": e} for e in attendees]

    kwargs: dict = {"calendarId": "primary", "body": body}
    if add_meet_link:
        body["conferenceData"] = {
            "createRequest": {
                "requestId": f"meet-{int(time.time())}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }
        kwargs["conferenceDataVersion"] = 1

    return service.events().insert(**kwargs).execute()


async def update_google_event_time(
    user_id: str, google_event_id: str, start_time: str, end_time: str
) -> dict:
    """Patch an existing event's start/end time."""
    service = await get_calendar_client(user_id)
    return (
        service.events()
        .patch(
            calendarId="primary",
            eventId=google_event_id,
            body={
                "start": {"dateTime": start_time},
                "end": {"dateTime": end_time},
            },
        )
        .execute()
    )


async def respond_to_google_event(
    user_id: str, google_event_id: str, response: str
) -> dict:
    """RSVP — accepted / declined / tentative. Finds the user among attendees and updates responseStatus."""
    service = await get_calendar_client(user_id)

    # Resolve the current user's email so we know which attendee to update.
    user = await prisma.user.find_unique(where={"id": user_id})
    if not user or not user.email:
        raise RuntimeError("User email not found.")
    my_email = user.email.lower()

    event = service.events().get(calendarId="primary", eventId=google_event_id).execute()
    attendees = event.get("attendees", [])
    updated = False
    for a in attendees:
        if a.get("email", "").lower() == my_email or a.get("self"):
            a["responseStatus"] = response
            updated = True
            break

    if not updated:
        # User wasn't in the attendee list — add them with the response.
        attendees.append({"email": my_email, "responseStatus": response, "self": True})

    return (
        service.events()
        .patch(
            calendarId="primary",
            eventId=google_event_id,
            body={"attendees": attendees},
            sendUpdates="all",
        )
        .execute()
    )


async def cancel_google_event(user_id: str, google_event_id: str) -> None:
    """Delete the event."""
    service = await get_calendar_client(user_id)
    service.events().delete(
        calendarId="primary", eventId=google_event_id, sendUpdates="all"
    ).execute()
