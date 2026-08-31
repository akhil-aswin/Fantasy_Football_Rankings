import { describe, expect, it } from "vitest";
import { EMPTY_STAT_LINE, PlayerData, Position } from "./types";
import {
  SCORING_PRESETS,
  DEFAULT_LEAGUE_SETTINGS,
  DEFAULT_RANKING_WEIGHTS,
  scoreStatLine,
  blendStatLines,
  computeReplacementLevels,
  rankPlayers,
  buildRoster,
  bestAvailablePick,
  LeagueSettings,
  RankedPlayer,
} from "./ranking";

describe("scoreStatLine", () => {
  const wrLine = { ...EMPTY_STAT_LINE, rec: 100, recYds: 1200, recTd: 10 };

  it("matches hand-calculated standard scoring", () => {
    // 1200 * 0.1 + 10 * 6 = 120 + 60 = 180 (no reception points)
    expect(scoreStatLine(wrLine, SCORING_PRESETS.standard, "WR")).toBeCloseTo(180);
  });

  it("matches hand-calculated full-PPR scoring", () => {
    // 180 base + 100 receptions * 1pt = 280
    expect(scoreStatLine(wrLine, SCORING_PRESETS.ppr, "WR")).toBeCloseTo(280);
  });

  it("half-PPR sits exactly between standard and PPR for a reception-heavy line", () => {
    const std = scoreStatLine(wrLine, SCORING_PRESETS.standard, "WR");
    const half = scoreStatLine(wrLine, SCORING_PRESETS.halfPpr, "WR");
    const ppr = scoreStatLine(wrLine, SCORING_PRESETS.ppr, "WR");
    expect(half).toBeCloseTo((std + ppr) / 2);
  });

  it("applies TE reception bonus only to TEs", () => {
    const settings = { ...SCORING_PRESETS.standard, teReceptionBonus: 0.5 };
    const teLine = { ...EMPTY_STAT_LINE, rec: 10 };
    expect(scoreStatLine(teLine, settings, "TE")).toBeCloseTo(5);
    expect(scoreStatLine(teLine, settings, "WR")).toBeCloseTo(0);
  });
});

describe("blendStatLines", () => {
  it("averages equally-weighted sources", () => {
    const a = { ...EMPTY_STAT_LINE, recYds: 1000 };
    const b = { ...EMPTY_STAT_LINE, recYds: 1200 };
    const blended = blendStatLines(
      [
        { source: "a", statLine: a },
        { source: "b", statLine: b },
      ],
      {}
    );
    expect(blended.recYds).toBeCloseTo(1100);
  });

  it("renormalizes over only the sources present for a given player", () => {
    const a = { ...EMPTY_STAT_LINE, recYds: 1000 };
    const blended = blendStatLines([{ source: "a", statLine: a }], { a: 1, b: 5 });
    expect(blended.recYds).toBeCloseTo(1000);
  });

  it("respects custom source weights", () => {
    const a = { ...EMPTY_STAT_LINE, recYds: 1000 };
    const b = { ...EMPTY_STAT_LINE, recYds: 2000 };
    const blended = blendStatLines(
      [
        { source: "a", statLine: a },
        { source: "b", statLine: b },
      ],
      { a: 3, b: 1 }
    );
    // (1000*3 + 2000*1) / 4 = 1250
    expect(blended.recYds).toBeCloseTo(1250);
  });
});

describe("computeReplacementLevels", () => {
  const scoresByPosition = {
    QB: Array.from({ length: 40 }, (_, i) => 400 - i * 5),
    RB: Array.from({ length: 80 }, (_, i) => 300 - i * 3),
    WR: Array.from({ length: 80 }, (_, i) => 280 - i * 3),
    TE: Array.from({ length: 40 }, (_, i) => 200 - i * 4),
  };

  it("moves the replacement level deeper (lower score) as league size grows", () => {
    const small: LeagueSettings = {
      teams: 8,
      bench: 6,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
    };
    const large: LeagueSettings = {
      teams: 16,
      bench: 6,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
    };
    const smallLevels = computeReplacementLevels(scoresByPosition, small);
    const largeLevels = computeReplacementLevels(scoresByPosition, large);
    expect(largeLevels.RB).toBeLessThan(smallLevels.RB);
    expect(largeLevels.WR).toBeLessThan(smallLevels.WR);
  });

  it("raises QB replacement level when superflex is enabled", () => {
    const noSuperflex: LeagueSettings = {
      teams: 12,
      bench: 6,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
    };
    const superflex: LeagueSettings = {
      teams: 12,
      bench: 6,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 1 },
    };
    const withoutSf = computeReplacementLevels(scoresByPosition, noSuperflex);
    const withSf = computeReplacementLevels(scoresByPosition, superflex);
    expect(withSf.QB).toBeLessThanOrEqual(withoutSf.QB);
  });
});

describe("rankPlayers", () => {
  function player(overrides: Partial<PlayerData>): PlayerData {
    return {
      id: "p1",
      name: "Test Player",
      position: "WR",
      team: "TST",
      status: "Active",
      projections: [],
      actuals: [],
      ...overrides,
    };
  }

  it("ranks a pure-volume projected WR above a low-volume one under PPR", () => {
    const star = player({
      id: "star",
      projections: [
        { source: "a", statLine: { ...EMPTY_STAT_LINE, games: 17, rec: 100, recYds: 1300, recTd: 9 } },
      ],
    });
    const bench = player({
      id: "bench",
      projections: [
        { source: "a", statLine: { ...EMPTY_STAT_LINE, games: 17, rec: 20, recYds: 250, recTd: 1 } },
      ],
    });
    const ranked = rankPlayers(
      [star, bench],
      SCORING_PRESETS.ppr,
      DEFAULT_LEAGUE_SETTINGS,
      DEFAULT_RANKING_WEIGHTS
    );
    expect(ranked[0].id).toBe("star");
  });

  it("weights toward history as trustProjection moves to 0", () => {
    const p = player({
      id: "p1",
      projections: [
        { source: "a", statLine: { ...EMPTY_STAT_LINE, games: 17, rec: 100, recYds: 1500, recTd: 12 } },
      ],
      actuals: [
        {
          season: 2025,
          games: 10,
          sources: [
            { source: "nflverse", statLine: { ...EMPTY_STAT_LINE, rec: 20, recYds: 200, recTd: 1 } },
          ],
        },
      ],
    });

    const pureProjection = rankPlayers([p], SCORING_PRESETS.ppr, DEFAULT_LEAGUE_SETTINGS, {
      ...DEFAULT_RANKING_WEIGHTS,
      trustProjection: 1,
    })[0];
    const pureHistory = rankPlayers([p], SCORING_PRESETS.ppr, DEFAULT_LEAGUE_SETTINGS, {
      ...DEFAULT_RANKING_WEIGHTS,
      trustProjection: 0,
    })[0];

    expect(pureProjection.pointsPerGame).toBeGreaterThan(pureHistory.pointsPerGame);
  });

  it("compositeScore scales linearly with vorpInfluence per the defining formula", () => {
    const eliteQb = player({
      id: "qb1",
      position: "QB",
      projections: [
        {
          source: "a",
          statLine: { ...EMPTY_STAT_LINE, games: 17, passYds: 4500, passTd: 30, passInt: 10 },
        },
      ],
    });
    const midWr = player({
      id: "wr1",
      position: "WR",
      projections: [
        { source: "a", statLine: { ...EMPTY_STAT_LINE, games: 17, rec: 60, recYds: 800, recTd: 5 } },
      ],
    });
    // Flood the WR pool with cheap depth so WR replacement level is low,
    // and keep the QB pool thin so QB replacement level stays relatively high.
    const filler: PlayerData[] = Array.from({ length: 60 }, (_, i) =>
      player({
        id: `wr_filler_${i}`,
        position: "WR",
        projections: [
          {
            source: "a",
            statLine: { ...EMPTY_STAT_LINE, games: 17, rec: 30 - i * 0.2, recYds: 300 - i * 3 },
          },
        ],
      })
    );
    const qbFiller: PlayerData[] = Array.from({ length: 20 }, (_, i) =>
      player({
        id: `qb_filler_${i}`,
        position: "QB",
        projections: [
          {
            source: "a",
            statLine: { ...EMPTY_STAT_LINE, games: 17, passYds: 3500 - i * 50, passTd: 20 - i },
          },
        ],
      })
    );

    const players = [eliteQb, midWr, ...filler, ...qbFiller];
    const lowVorp = rankPlayers(players, SCORING_PRESETS.ppr, DEFAULT_LEAGUE_SETTINGS, {
      ...DEFAULT_RANKING_WEIGHTS,
      vorpInfluence: 0,
    });
    const highVorp = rankPlayers(players, SCORING_PRESETS.ppr, DEFAULT_LEAGUE_SETTINGS, {
      ...DEFAULT_RANKING_WEIGHTS,
      vorpInfluence: 2,
    });

    const rankOf = (list: typeof lowVorp, id: string) => list.findIndex((p) => p.id === id);

    // With vorpInfluence=0, ranking is pure raw points (QB should lead, QBs score highest raw).
    expect(rankOf(lowVorp, "qb1")).toBeLessThan(rankOf(lowVorp, "wr1"));

    // compositeScore is defined as seasonPoints + vorpInfluence * vorp — verify
    // that relationship holds exactly (and therefore that changing the weight
    // does move each player's score, proportional to their own VORP).
    for (const id of ["qb1", "wr1"]) {
      const low = lowVorp.find((p) => p.id === id)!;
      const high = highVorp.find((p) => p.id === id)!;
      expect(low.compositeScore).toBeCloseTo(low.seasonPoints + 0 * low.vorp);
      expect(high.compositeScore).toBeCloseTo(high.seasonPoints + 2 * high.vorp);
      if (high.vorp !== 0) {
        expect(high.compositeScore).not.toBeCloseTo(low.compositeScore);
      }
    }
  });

  it("recomputes VORP from only the available pool when availableIds is given", () => {
    // Two RBs identical except one gets drafted away — with a tiny RB pool,
    // removing one from "available" should raise (or hold steady, if not
    // limiting) the replacement level context, changing VORP for the rest.
    const makeRb = (id: string, recYds: number) =>
      player({
        id,
        position: "RB",
        projections: [{ source: "a", statLine: { ...EMPTY_STAT_LINE, games: 17, rushYds: recYds } }],
      });
    // Pool must be deeper than the league's total RB demand (24 dedicated +
    // up to 12 FLEX = 36 slots here) so the replacement level sits at an
    // interior index that actually shifts when the top player is removed.
    const rbs = Array.from({ length: 45 }, (_, i) => makeRb(`rb${i}`, 1500 - i * 20));

    const fullPool = rankPlayers(rbs, SCORING_PRESETS.ppr, DEFAULT_LEAGUE_SETTINGS, DEFAULT_RANKING_WEIGHTS);
    const withoutTopRb = new Set(rbs.map((p) => p.id).filter((id) => id !== "rb0"));
    const reduced = rankPlayers(
      rbs,
      SCORING_PRESETS.ppr,
      DEFAULT_LEAGUE_SETTINGS,
      DEFAULT_RANKING_WEIGHTS,
      withoutTopRb
    );

    const fullRb1 = fullPool.find((p) => p.id === "rb1")!;
    const reducedRb1 = reduced.find((p) => p.id === "rb1")!;
    // With rb0 removed from the available pool, the replacement-level
    // calculation shifts one slot deeper into the remaining pool, so rb1's
    // VORP should differ from the full-pool calculation.
    expect(reducedRb1.vorp).not.toBeCloseTo(fullRb1.vorp);
  });
});

describe("buildRoster", () => {
  function rp(overrides: Partial<RankedPlayer>): RankedPlayer {
    return {
      id: "p1",
      name: "Test",
      position: "WR",
      team: "TST",
      status: "Active",
      seasonPoints: 100,
      pointsPerGame: 10,
      vorp: 50,
      compositeScore: 100,
      sources: [],
      ...overrides,
    };
  }

  const league: LeagueSettings = {
    teams: 12,
    bench: 6,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
  };

  it("fills dedicated slots with the highest-scoring player at that position", () => {
    const myPlayers = [
      rp({ id: "rb1", position: "RB", compositeScore: 200 }),
      rp({ id: "rb2", position: "RB", compositeScore: 150 }),
      rp({ id: "rb3", position: "RB", compositeScore: 100 }),
    ];
    const { starterSlots, overflow } = buildRoster(myPlayers, league);
    const rbSlots = starterSlots.filter((s) => s.label === "RB");
    expect(rbSlots.map((s) => s.player?.id)).toEqual(["rb1", "rb2"]);
    // 3rd RB doesn't fit a dedicated slot but is a FLEX candidate
    const flexSlot = starterSlots.find((s) => s.label === "FLEX");
    expect(flexSlot?.player?.id).toBe("rb3");
    expect(overflow).toHaveLength(0);
  });

  it("sends leftover skill-position players to bench slots, then overflow once bench is full", () => {
    const myPlayers = Array.from({ length: 9 }, (_, i) =>
      rp({ id: `wr${i}`, position: "WR", compositeScore: 300 - i * 10 })
    );
    const { starterSlots, benchSlots, overflow } = buildRoster(myPlayers, league);
    const starterCount = starterSlots.filter((s) => s.player).length;
    expect(starterCount).toBe(3); // 2 dedicated WR + 1 FLEX
    // 6 bench slots, all WR-eligible, absorb the next 6 best
    expect(benchSlots.filter((s) => s.player).length).toBe(6);
    expect(benchSlots.map((s) => s.player?.id)).toEqual([
      "wr3",
      "wr4",
      "wr5",
      "wr6",
      "wr7",
      "wr8",
    ]);
    expect(overflow).toHaveLength(0);
  });

  it("does not fill bench slots with a backup QB", () => {
    const myPlayers = [
      rp({ id: "qb1", position: "QB", compositeScore: 400 }), // starter
      rp({ id: "qb2", position: "QB", compositeScore: 350 }), // would be "best remaining" if QB-eligible
      rp({ id: "rb1", position: "RB", compositeScore: 100 }),
    ];
    const { starterSlots, benchSlots, overflow } = buildRoster(myPlayers, league);
    expect(starterSlots.find((s) => s.label === "QB")?.player?.id).toBe("qb1");
    expect(benchSlots.some((s) => s.player?.id === "qb2")).toBe(false);
    // the extra QB has no eligible slot at all, so it lands in overflow rather
    // than silently disappearing
    expect(overflow.map((p) => p.id)).toContain("qb2");
  });

  it("leaves a slot empty when no eligible player is available", () => {
    const { starterSlots } = buildRoster([], league);
    expect(starterSlots.every((s) => s.player === null)).toBe(true);
  });
});

describe("bestAvailablePick", () => {
  function rp(overrides: Partial<RankedPlayer>): RankedPlayer {
    return {
      id: "p1",
      name: "Test",
      position: "WR",
      team: "TST",
      status: "Active",
      seasonPoints: 100,
      pointsPerGame: 10,
      vorp: 50,
      compositeScore: 100,
      sources: [],
      ...overrides,
    };
  }

  it("recommends the best available player who can fill an open slot", () => {
    const slots = [
      { id: "QB-0", label: "QB", eligiblePositions: ["QB"] as Position[], player: rp({ id: "myqb", position: "QB" }) },
      { id: "RB-0", label: "RB", eligiblePositions: ["RB"] as Position[], player: null },
    ];
    const available = [
      rp({ id: "bestQb", position: "QB", compositeScore: 500 }), // higher score but no open QB slot
      rp({ id: "bestRb", position: "RB", compositeScore: 300 }),
      rp({ id: "bestWr", position: "WR", compositeScore: 400 }), // higher score but no open WR slot
    ];
    const pick = bestAvailablePick(available, slots);
    expect(pick?.id).toBe("bestRb");
  });

  it("falls back to the highest-scoring player overall once the lineup is full", () => {
    const slots = [
      { id: "QB-0", label: "QB", eligiblePositions: ["QB"] as Position[], player: rp({ id: "myqb" }) },
    ];
    const available = [
      rp({ id: "a", compositeScore: 100 }),
      rp({ id: "b", compositeScore: 250 }),
    ];
    const pick = bestAvailablePick(available, slots);
    expect(pick?.id).toBe("b");
  });

  it("returns null when no players are available", () => {
    expect(bestAvailablePick([], [])).toBeNull();
  });

  it("does not recommend a backup QB for an open bench slot, even a high-scoring one", () => {
    const league: LeagueSettings = {
      teams: 12,
      bench: 6,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
    };
    const myTeam = [
      rp({ id: "myqb", position: "QB", compositeScore: 300 }),
      rp({ id: "myrb1", position: "RB", compositeScore: 250 }),
      rp({ id: "myrb2", position: "RB", compositeScore: 200 }),
      rp({ id: "mywr1", position: "WR", compositeScore: 220 }),
      rp({ id: "mywr2", position: "WR", compositeScore: 180 }),
      rp({ id: "myte", position: "TE", compositeScore: 150 }),
      rp({ id: "myflex", position: "RB", compositeScore: 140 }),
    ];
    const { starterSlots, benchSlots } = buildRoster(myTeam, league);
    expect(starterSlots.every((s) => s.player)).toBe(true); // whole starting lineup is full

    const available = [
      rp({ id: "eliteBackupQb", position: "QB", compositeScore: 350 }), // outscores every bench-eligible option
      rp({ id: "depthRb", position: "RB", compositeScore: 90 }),
    ];
    const pick = bestAvailablePick(available, [...starterSlots, ...benchSlots]);
    expect(pick?.id).toBe("depthRb");
  });
});
