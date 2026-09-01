# Gridiron Board

A fantasy football draft assistant that blends projections and historical performance from multiple sources into a single live draft board — ranking every player by **VORP (Value Over Replacement Player)**, which recalculates in real time as players come off the board.

## Why VORP instead of a static big board

A player's raw projected points don't tell you how much they're actually worth in a draft — a QB13 and a QB20 are close in points but a RB13 and RB20 are not, because starting-lineup scarcity differs by position. VORP fixes that by scoring every player relative to their position's **replacement level**: the value of the last player who'd realistically start, given the league's actual roster settings (including FLEX/SUPERFLEX eligibility).

Replacement level is computed with a greedy simulation (`computeReplacementLevels` in [`lib/ranking.ts`](lib/ranking.ts)) that fills every starting slot across the league — dedicated slots first, then FLEX, then SUPERFLEX — always taking the next-highest-scoring available player. As you mark players drafted, the pool of "available" players shrinks and replacement levels are recomputed, so every remaining player's VORP reflects the board as it actually stands, not a preseason snapshot.

## How a player's score is built

1. **Blend sources** — projections and historical stat lines from Sleeper, ESPN, and nflverse are merged with configurable per-source weights (`blendStatLines`).
2. **Score against your league's scoring settings** — standard, half-PPR, full PPR, or a custom rule set, including a TE-premium reception bonus (`scoreStatLine`).
3. **Blend projection vs. history** — a `trustProjection` weight combines this season's projection with recency-weighted points-per-game from past seasons (`seasonRecencyDecay` discounts older seasons).
4. **Convert to VORP** — the blended score is compared against the live replacement level for that position.
5. **Composite score** — `seasonScore + vorpInfluence * vorp` produces the final rank, with `vorpInfluence` tunable so you can dial positional scarcity up or down.

All of the above is user-adjustable from the app's settings panel and persisted to `localStorage`, so a league's scoring rules and roster shape don't need to be re-entered every session.

## Features

- **Live draft board** — sortable/filterable player table with source badges, drafted/available toggling, and "add to my team."
- **Suggested pick** — surfaces the single highest-VORP player who can still fill an open slot on your roster (falls back to best-overall once your roster is full).
- **My Team view** — assigns your drafted players into starter/FLEX/SUPERFLEX/bench slots using the same greedy fill logic as replacement-level calculation, so slot assignments stay consistent with the rankings.
- **Configurable scoring & league settings** — standard/half-PPR/PPR presets or fully custom scoring, custom roster construction (teams, starters per position, FLEX/SUPERFLEX counts, bench size).
- **Multi-source data ingest** — pulls and merges projections/actuals from Sleeper, ESPN, and nflverse, with cross-source name matching to reconcile players who don't share a common ID (`scripts/name-match.ts`).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Prisma 7](https://www.prisma.io) with the `better-sqlite3` driver adapter (SQLite)
- [Vitest](https://vitest.dev) for unit tests

## Getting started

```bash
npm install

# .env already points at a local SQLite file (DATABASE_URL="file:./dev.db")
npx prisma migrate dev

# Pull player data (requires network access to Sleeper/ESPN/nflverse)
npm run ingest

npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Draft state (drafted players, your team, scoring/league settings) lives in the browser's `localStorage`, so it persists across reloads without a server-side account system.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run ingest` | Run all three ingest scripts in sequence |
| `npm run ingest:sleeper` | Player metadata + Sleeper projections |
| `npm run ingest:espn` | ESPN projections |
| `npm run ingest:nflverse` | Historical weekly actuals (last two seasons) |
| `npm test` | Run the Vitest suite (`lib/ranking.test.ts`) |

## Project structure

```
app/                  Next.js App Router pages + API routes
  api/players/route.ts    GET endpoint assembling blended player data from the DB
components/           React UI (players table, team view, settings panel, suggested pick)
lib/
  ranking.ts             Scoring, blending, VORP, replacement-level, roster-fill logic
  ranking.test.ts         Unit tests for the ranking engine
  prisma.ts / types.ts    DB client + shared types
scripts/              Data ingest (Sleeper, ESPN, nflverse) + cross-source name matching
prisma/schema.prisma  Player / ProjectionStatLine / ActualStatLine models
```
