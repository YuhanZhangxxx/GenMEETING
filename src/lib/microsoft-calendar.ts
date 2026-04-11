import { prisma } from "@/lib/prisma";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;

/** Force-refresh the Microsoft access token using the stored refresh_token. */
async function refreshMicrosoftToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "microsoft" },
  });
  if (!account) throw new Error("No Microsoft account linked.");
  if (!account.refresh_token) throw new Error("No Microsoft refresh token available.");

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: account.refresh_token,
    grant_type: "refresh_token",
    scope: "openid profile email offline_access https://graph.microsoft.com/Calendars.ReadWrite",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Microsoft token refresh failed: ${err?.error_description ?? err?.error ?? res.status}`);
  }

  const tokens = await res.json();
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      expires_at: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : account.expires_at,
      refresh_token: tokens.refresh_token ?? account.refresh_token,
    },
  });

  return tokens.access_token;
}

/** Returns a valid access token, refreshing if nearing expiry. */
export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "microsoft" },
  });
  if (!account?.access_token) throw new Error("No Microsoft account linked.");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isExpired = account.expires_at && account.expires_at < nowSeconds + 60;

  if (!isExpired) return account.access_token;

  return refreshMicrosoftToken(userId);
}

/** Generic Graph API fetch helper — retries once with a fresh token on 401. */
async function graphFetch(userId: string, path: string, init?: RequestInit) {
  async function doFetch(token: string) {
    return fetch(`${GRAPH_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  let token = await getMicrosoftAccessToken(userId);
  let res = await doFetch(token);

  // If 401, force-refresh once and retry
  if (res.status === 401) {
    console.warn("[graphFetch] 401 on first attempt, force-refreshing token...");
    try {
      token = await refreshMicrosoftToken(userId);
      res = await doFetch(token);
    } catch (refreshErr) {
      throw new Error(`Microsoft token refresh failed: ${(refreshErr as Error).message}`);
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("[graphFetch] error response:", JSON.stringify(errBody));
    const msg =
      errBody?.error?.message ??
      errBody?.error?.code ??
      `Graph API error ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Fetch Outlook calendar events for the next N days. */
export async function fetchOutlookEvents(userId: string, daysAhead = 14) {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const data = await graphFetch(
    userId,
    `/me/calendarView?startDateTime=${now}&endDateTime=${end}&$top=200&$select=id,subject,start,end,organizer,attendees,isOrganizer,onlineMeeting,bodyPreview`
  );
  return (data?.value ?? []) as OutlookEvent[];
}

/** Create an Outlook calendar event. */
export async function createOutlookEvent(
  userId: string,
  params: {
    title: string;
    startTime: string;
    endTime: string;
    description?: string;
    attendees?: string[];
    addMeetLink?: boolean;
  }
) {
  const body: Record<string, unknown> = {
    subject: params.title,
    body: { contentType: "text", content: params.description ?? "" },
    start: { dateTime: params.startTime, timeZone: "UTC" },
    end: { dateTime: params.endTime, timeZone: "UTC" },
    attendees: (params.attendees ?? []).map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
  };

  if (params.addMeetLink) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  return graphFetch(userId, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Update start/end of an Outlook event. */
export async function updateOutlookEventTime(
  userId: string,
  outlookEventId: string,
  startTime: string,
  endTime: string
) {
  return graphFetch(userId, `/me/events/${outlookEventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: startTime, timeZone: "UTC" },
      end: { dateTime: endTime, timeZone: "UTC" },
    }),
  });
}

/** Delete an Outlook event. */
export async function deleteOutlookEvent(userId: string, outlookEventId: string) {
  return graphFetch(userId, `/me/events/${outlookEventId}`, { method: "DELETE" });
}

/** RSVP to an Outlook event. */
export async function respondToOutlookEvent(
  userId: string,
  outlookEventId: string,
  response: "accept" | "decline" | "tentativelyAccept"
) {
  return graphFetch(userId, `/me/events/${outlookEventId}/${response}`, {
    method: "POST",
    body: JSON.stringify({ comment: "" }),
  });
}

// ---- Types ----
export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isOrganizer: boolean;
  organizer: { emailAddress: { address: string; name: string } };
  attendees: Array<{
    emailAddress: { address: string; name: string };
    status: { response: string };
    type: string;
  }>;
  onlineMeeting?: { joinUrl: string } | null;
  bodyPreview?: string;
}
