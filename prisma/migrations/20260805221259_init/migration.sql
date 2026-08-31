-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "espnId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT,
    "status" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectionStatLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER,
    "games" REAL,
    "passYds" REAL NOT NULL DEFAULT 0,
    "passTd" REAL NOT NULL DEFAULT 0,
    "passInt" REAL NOT NULL DEFAULT 0,
    "rushYds" REAL NOT NULL DEFAULT 0,
    "rushTd" REAL NOT NULL DEFAULT 0,
    "rec" REAL NOT NULL DEFAULT 0,
    "recYds" REAL NOT NULL DEFAULT 0,
    "recTd" REAL NOT NULL DEFAULT 0,
    "fumblesLost" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "ProjectionStatLine_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActualStatLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "passYds" REAL NOT NULL DEFAULT 0,
    "passTd" REAL NOT NULL DEFAULT 0,
    "passInt" REAL NOT NULL DEFAULT 0,
    "rushYds" REAL NOT NULL DEFAULT 0,
    "rushTd" REAL NOT NULL DEFAULT 0,
    "rec" REAL NOT NULL DEFAULT 0,
    "recYds" REAL NOT NULL DEFAULT 0,
    "recTd" REAL NOT NULL DEFAULT 0,
    "fumblesLost" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "ActualStatLine_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_espnId_key" ON "Player"("espnId");

-- CreateIndex
CREATE INDEX "Player_position_idx" ON "Player"("position");

-- CreateIndex
CREATE INDEX "ProjectionStatLine_source_season_idx" ON "ProjectionStatLine"("source", "season");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionStatLine_playerId_source_season_week_key" ON "ProjectionStatLine"("playerId", "source", "season", "week");

-- CreateIndex
CREATE INDEX "ActualStatLine_source_season_idx" ON "ActualStatLine"("source", "season");

-- CreateIndex
CREATE UNIQUE INDEX "ActualStatLine_playerId_source_season_week_key" ON "ActualStatLine"("playerId", "source", "season", "week");
