/*
  Warnings:

  - Made the column `week` on table `ProjectionStatLine` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectionStatLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
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
INSERT INTO "new_ProjectionStatLine" ("fumblesLost", "games", "id", "passInt", "passTd", "passYds", "playerId", "rec", "recTd", "recYds", "rushTd", "rushYds", "season", "source", "week") SELECT "fumblesLost", "games", "id", "passInt", "passTd", "passYds", "playerId", "rec", "recTd", "recYds", "rushTd", "rushYds", "season", "source", "week" FROM "ProjectionStatLine";
DROP TABLE "ProjectionStatLine";
ALTER TABLE "new_ProjectionStatLine" RENAME TO "ProjectionStatLine";
CREATE INDEX "ProjectionStatLine_source_season_idx" ON "ProjectionStatLine"("source", "season");
CREATE UNIQUE INDEX "ProjectionStatLine_playerId_source_season_week_key" ON "ProjectionStatLine"("playerId", "source", "season", "week");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
