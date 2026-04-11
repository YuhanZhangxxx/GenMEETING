import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

/** Returns a fresh access token for the user, refreshing if expired. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) throw new Error("No Google account linked for this user.");
  if (!account.access_token) throw new Error("No access token found.");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isExpired = account.expires_at && account.expires_at < nowSeconds + 60;

  if (!isExpired) return account.access_token;

  // Token expired — refresh it
  if (!account.refresh_token) throw new Error("No refresh token available.");

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: account.refresh_token });

  const { credentials } = await oauth2Client.refreshAccessToken();

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: credentials.access_token ?? account.access_token,
      expires_at: credentials.expiry_date
        ? Math.floor(credentials.expiry_date / 1000)
        : account.expires_at,
    },
  });

  return credentials.access_token ?? account.access_token;
}

/** Returns an authenticated Google Calendar API client. */
export async function getCalendarClient(userId: string) {
  const accessToken = await getValidAccessToken(userId);
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/** Fetches events for the next N days from Google Calendar. */
export async function fetchGoogleEvents(userId: string, daysAhead = 14) {
  const calendar = await getCalendarClient(userId);

  const timeMin = new Date().toISOString();
  const timeMax = new Date(
    Date.now() + daysAhead * 24 * 60 * 60 * 1000
  ).toISOString();

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 200,
  });

  return response.data.items ?? [];
}

/** Creates a new event on Google Calendar. */
export async function createGoogleEvent(
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
  const calendar = await getCalendarClient(userId);

  const eventBody: import("googleapis").calendar_v3.Schema$Event = {
    summary: params.title,
    description: params.description,
    start: { dateTime: params.startTime },
    end: { dateTime: params.endTime },
    attendees: params.attendees?.map((email) => ({ email })),
  };

  if (params.addMeetLink) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
    conferenceDataVersion: params.addMeetLink ? 1 : undefined,
  });

  return response.data;
}

/** Updates the time of an existing Google Calendar event. */
export async function updateGoogleEventTime(
  userId: string,
  googleEventId: string,
  startTime: string,
  endTime: string
) {
  const calendar = await getCalendarClient(userId);

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId: googleEventId,
    requestBody: {
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    },
  });

  return response.data;
}
