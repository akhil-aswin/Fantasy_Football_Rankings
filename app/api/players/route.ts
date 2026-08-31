import { prisma } from "@/lib/prisma";
import { PlayerData, Position, SeasonActuals, SourceStatLine, StatLine } from "@/lib/types";

function toStatLine(row: {
  passYds: number;
  passTd: number;
  passInt: number;
  rushYds: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  fumblesLost: number;
  games?: number | null;
}): StatLine {
  return {
    games: row.games ?? null,
    passYds: row.passYds,
    passTd: row.passTd,
    passInt: row.passInt,
    rushYds: row.rushYds,
    rushTd: row.rushTd,
    rec: row.rec,
    recYds: row.recYds,
    recTd: row.recTd,
    fumblesLost: row.fumblesLost,
  };
}

export async function GET() {
  const players = await prisma.player.findMany({
    include: {
      projections: { where: { week: 0 } },
      actuals: true,
    },
  });

  const data: PlayerData[] = players
    .map((p): PlayerData => {
      const projections: SourceStatLine[] = p.projections.map((row) => ({
        source: row.source,
        statLine: toStatLine(row),
      }));

      const bySeasonSource = new Map<string, { season: number; source: string; rows: typeof p.actuals }>();
      for (const row of p.actuals) {
        const key = `${row.season}|${row.source}`;
        const entry = bySeasonSource.get(key) ?? { season: row.season, source: row.source, rows: [] };
        entry.rows.push(row);
        bySeasonSource.set(key, entry);
      }

      const seasonMap = new Map<number, SeasonActuals>();
      for (const { season, source, rows } of bySeasonSource.values()) {
        const summed = rows.reduce(
          (acc, r) => ({
            passYds: acc.passYds + r.passYds,
            passTd: acc.passTd + r.passTd,
            passInt: acc.passInt + r.passInt,
            rushYds: acc.rushYds + r.rushYds,
            rushTd: acc.rushTd + r.rushTd,
            rec: acc.rec + r.rec,
            recYds: acc.recYds + r.recYds,
            recTd: acc.recTd + r.recTd,
            fumblesLost: acc.fumblesLost + r.fumblesLost,
          }),
          { passYds: 0, passTd: 0, passInt: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, fumblesLost: 0 }
        );
        const sourceLine: SourceStatLine = { source, statLine: toStatLine(summed) };

        const existing = seasonMap.get(season);
        if (existing) {
          existing.sources.push(sourceLine);
          existing.games = Math.max(existing.games, rows.length);
        } else {
          seasonMap.set(season, { season, games: rows.length, sources: [sourceLine] });
        }
      }

      const actuals = Array.from(seasonMap.values()).sort((a, b) => b.season - a.season);

      return {
        id: p.id,
        name: p.name,
        position: p.position as Position,
        team: p.team,
        status: p.status,
        projections,
        actuals,
      };
    })
    .filter((p) => p.projections.length > 0 || p.actuals.length > 0);

  return Response.json({ players: data, generatedAt: new Date().toISOString() });
}
