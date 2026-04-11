-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleEventId" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "proposedSlots" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "selectedSlot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relatedId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarEventCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google',
    "title" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT false,
    "organizerEmail" TEXT,
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "myResponseStatus" TEXT,
    "meetingLink" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CalendarEventCache" ("allDay", "attendees", "endTime", "fetchedAt", "googleEventId", "id", "isEditable", "meetingLink", "source", "startTime", "title", "userId") SELECT "allDay", "attendees", "endTime", "fetchedAt", "googleEventId", "id", "isEditable", "meetingLink", "source", "startTime", "title", "userId" FROM "CalendarEventCache";
DROP TABLE "CalendarEventCache";
ALTER TABLE "new_CalendarEventCache" RENAME TO "CalendarEventCache";
CREATE INDEX "CalendarEventCache_userId_startTime_idx" ON "CalendarEventCache"("userId", "startTime");
CREATE UNIQUE INDEX "CalendarEventCache_userId_googleEventId_key" ON "CalendarEventCache"("userId", "googleEventId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
