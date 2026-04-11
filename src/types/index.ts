export interface Attendee {
  email: string;
  responseStatus: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
}

export interface MeetingEvent {
  id: string;
  googleEventId: string;
  source: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  isOrganizer: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canRespond: boolean;
  canRequestChange: boolean;
  organizerEmail: string | null;
  attendees: Attendee[];
  myResponseStatus: string | null;
  meetingLink: string | null;
  userEmail: string;
}

export interface BlackoutTime {
  day: number;
  start: string;
  end: string;
}

export interface UserPreferences {
  workDays: number[];
  workStart: string;
  workEnd: string;
  bufferMinutes: number;
  blackoutTimes: BlackoutTime[];
  preferredSlotMinutes: number;
  timezone: string;
  autoReschedule: boolean;
}

export interface ScoredSlot {
  start: Date;
  end: Date;
  score: number;
  reasons: string[];
}

export interface CreateEventPayload {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  attendees?: string[];
  addMeetLink?: boolean;
}

export interface ChangeRequestSlot {
  start: string;
  end: string;
  score?: number;
  reasons?: string[];
}
