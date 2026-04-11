-- CreateTable
CREATE TABLE "FavoriteContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FavoriteContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FavoriteContact_userId_idx" ON "FavoriteContact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteContact_userId_email_key" ON "FavoriteContact"("userId", "email");
