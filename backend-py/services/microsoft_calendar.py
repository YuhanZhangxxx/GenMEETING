"""
Microsoft Graph 日历服务，和 src/lib/microsoft-calendar.ts 对等。
用 httpx 直接打 Graph REST API（Graph Python SDK 太重）。
"""
import os
import time
from typing import Optional, Any

import httpx

from db import prisma


GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MS_SCOPE = (
    "openid profile email offline_access "
    "https://graph.microsoft.com/Calendars.ReadWrite"
)


async def _refresh_ms_token(user_id: str) -> str:
    """强制用 refresh_token 换一个新的 access_token，回写 DB。"""
    account = await prisma.account.find_first(
        where={"userId": user_id, "provider": "microsoft"}
    )
    if not account:
        raise RuntimeError("No Microsoft account linked.")
    if not account.refresh_token:
        raise RuntimeError("No Microsoft refresh token available.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": os.getenv("MICROSOFT_CLIENT_ID", ""),
                "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", ""),
                "refresh_token": account.refresh_token,
                "grant_type": "refresh_token",
                "scope": MS_SCOPE,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code >= 400:
        err = resp.json() if resp.content else {}
        msg = err.get("error_description") or err.get("error") or str(resp.status_code)
        raise RuntimeError(f"Microsoft token refresh failed: {msg}")

    tokens = resp.json()
    new_access = tokens["access_token"]
    new_expires_at = (
        int(time.time()) + tokens["expires_in"]
        if tokens.get("expires_in")
        else account.expires_at
    )
    new_refresh = tokens.get("refresh_token") or account.refresh_token

    await prisma.account.update(
        where={"id": account.id},
        data={
            "access_token": new_access,
            "expires_at": new_expires_at,
            "refresh_token": new_refresh,
        },
    )
    return new_access


async def get_ms_access_token(user_id: str) -> str:
    """有效 token，快过期就刷新。"""
    account = await prisma.account.find_first(
        where={"userId": user_id, "provider": "microsoft"}
    )
    if not account or not account.access_token:
        raise RuntimeError("No Microsoft account linked.")

    now = int(time.time())
    is_expired = account.expires_at is not None and account.expires_at < now + 60
    if not is_expired:
        return account.access_token

    return await _refresh_ms_token(user_id)


async def _graph_fetch(
    user_id: str,
    path: str,
    method: str = "GET",
    json_body: Optional[dict] = None,
) -> Any:
    """Graph 请求通用方法，401 自动刷新 token 重试一次。"""
    async def do_request(token: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=20.0) as client:
            return await client.request(
                method,
                f"{GRAPH_BASE}{path}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=json_body,
            )

    token = await get_ms_access_token(user_id)
    resp = await do_request(token)

    if resp.status_code == 401:
        # 强刷再试一次
        token = await _refresh_ms_token(user_id)
        resp = await do_request(token)

    if resp.status_code >= 400:
        try:
            err = resp.json()
        except Exception:
            err = {}
        msg = (
            err.get("error", {}).get("message")
            if isinstance(err.get("error"), dict)
            else None
        ) or f"Graph API error {resp.status_code}"
        raise RuntimeError(msg)

    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


async def fetch_outlook_events(user_id: str, days_ahead: int = 14) -> list:
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat()

    select = "id,subject,start,end,organizer,attendees,isOrganizer,onlineMeeting,bodyPreview"
    data = await _graph_fetch(
        user_id,
        f"/me/calendarView?startDateTime={now}&endDateTime={end}&$top=200&$select={select}",
    )
    return (data or {}).get("value", [])


async def create_outlook_event(
    user_id: str,
    title: str,
    start_time: str,
    end_time: str,
    description: Optional[str] = None,
    attendees: Optional[list[str]] = None,
    add_meet_link: bool = False,
) -> dict:
    body: dict = {
        "subject": title,
        "body": {"contentType": "text", "content": description or ""},
        "start": {"dateTime": start_time, "timeZone": "UTC"},
        "end": {"dateTime": end_time, "timeZone": "UTC"},
        "attendees": [
            {"emailAddress": {"address": e}, "type": "required"}
            for e in (attendees or [])
        ],
    }
    if add_meet_link:
        body["isOnlineMeeting"] = True
        body["onlineMeetingProvider"] = "teamsForBusiness"

    return await _graph_fetch(user_id, "/me/events", method="POST", json_body=body)


async def update_outlook_event_time(
    user_id: str, outlook_event_id: str, start_time: str, end_time: str
) -> dict:
    return await _graph_fetch(
        user_id,
        f"/me/events/{outlook_event_id}",
        method="PATCH",
        json_body={
            "start": {"dateTime": start_time, "timeZone": "UTC"},
            "end": {"dateTime": end_time, "timeZone": "UTC"},
        },
    )


async def delete_outlook_event(user_id: str, outlook_event_id: str) -> None:
    await _graph_fetch(user_id, f"/me/events/{outlook_event_id}", method="DELETE")


async def respond_to_outlook_event(
    user_id: str, outlook_event_id: str, response: str
) -> Any:
    """
    response 必须是 accept / decline / tentativelyAccept。
    """
    if response not in ("accept", "decline", "tentativelyAccept"):
        raise ValueError("invalid response")
    return await _graph_fetch(
        user_id,
        f"/me/events/{outlook_event_id}/{response}",
        method="POST",
        json_body={"comment": ""},
    )
