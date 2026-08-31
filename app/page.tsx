"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LEAGUE_SETTINGS,
  DEFAULT_RANKING_WEIGHTS,
  LeagueSettings,
  RankingWeights,
  SCORING_PRESETS,
  ScoringSettings,
  rankPlayers,
  buildRoster,
  bestAvailablePick,
} from "@/lib/ranking";
import { PlayerData } from "@/lib/types";
import { useLocalStorageState } from "@/lib/useLocalStorageState";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PlayersTable } from "@/components/PlayersTable";
import { TeamView } from "@/components/TeamView";
import { SuggestedPick } from "@/components/SuggestedPick";
import styles from "./page.module.css";

export default function Home() {
  const [players, setPlayers] = useState<PlayerData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "team">("board");

  const [scoring, setScoring] = useLocalStorageState<ScoringSettings>(
    "ff-scoring",
    SCORING_PRESETS.ppr
  );
  const [league, setLeague] = useLocalStorageState<LeagueSettings>(
    "ff-league",
    DEFAULT_LEAGUE_SETTINGS
  );
  const [weights, setWeights] = useLocalStorageState<RankingWeights>(
    "ff-weights",
    DEFAULT_RANKING_WEIGHTS
  );
  const [draftedIds, setDraftedIds] = useLocalStorageState<string[]>("ff-drafted", []);
  const [myTeamIds, setMyTeamIds] = useLocalStorageState<string[]>("ff-my-team", []);
  const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds]);
  const myTeamSet = useMemo(() => new Set(myTeamIds), [myTeamIds]);

  function toggleDrafted(id: string) {
    setDraftedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // A player can't be "undrafted" while still sitting on your roster.
    setMyTeamIds((prev) => (draftedSet.has(id) ? prev.filter((x) => x !== id) : prev));
  }

  function clearDrafted() {
    if (draftedIds.length > 0 && !window.confirm(`Clear all ${draftedIds.length} drafted picks?`)) {
      return;
    }
    setDraftedIds([]);
    setMyTeamIds([]);
  }

  function addToTeam(id: string) {
    setMyTeamIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setDraftedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeFromTeam(id: string) {
    setMyTeamIds((prev) => prev.filter((x) => x !== id));
    setDraftedIds((prev) => prev.filter((x) => x !== id));
  }

  useEffect(() => {
    fetch("/api/players")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => setPlayers(data.players))
      .catch((err) => setError(err.message ?? "Failed to load players"));
  }, []);

  const allSources = useMemo(() => {
    if (!players) return [];
    const set = new Set<string>();
    for (const p of players) for (const s of p.projections) set.add(s.source);
    return Array.from(set).sort();
  }, [players]);

  const availableIds = useMemo(() => {
    if (!players) return new Set<string>();
    return new Set(players.filter((p) => !draftedSet.has(p.id)).map((p) => p.id));
  }, [players, draftedSet]);

  const ranked = useMemo(() => {
    if (!players) return [];
    return rankPlayers(players, scoring, league, weights, availableIds);
  }, [players, scoring, league, weights, availableIds]);

  const myTeamPlayers = useMemo(
    () => ranked.filter((p) => myTeamSet.has(p.id)),
    [ranked, myTeamSet]
  );
  const availablePlayers = useMemo(
    () => ranked.filter((p) => availableIds.has(p.id)),
    [ranked, availableIds]
  );
  const roster = useMemo(() => buildRoster(myTeamPlayers, league), [myTeamPlayers, league]);
  const suggestedPick = useMemo(
    () => bestAvailablePick(availablePlayers, [...roster.starterSlots, ...roster.benchSlots]),
    [availablePlayers, roster]
  );

  function resetAll() {
    setScoring(SCORING_PRESETS.ppr);
    setLeague(DEFAULT_LEAGUE_SETTINGS);
    setWeights(DEFAULT_RANKING_WEIGHTS);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Gridiron <span className={styles.titleAccent}>Board</span>
        </h1>
        <span className={styles.subtitle}>
          Blended fantasy rankings — projections, history &amp; positional value, tuned live.
        </span>
        <nav className={styles.tabs}>
          <button
            className={view === "board" ? styles.tabActive : styles.tab}
            onClick={() => setView("board")}
          >
            Board
          </button>
          <button
            className={view === "team" ? styles.tabActive : styles.tab}
            onClick={() => setView("team")}
          >
            My Team ({myTeamIds.length})
          </button>
        </nav>
      </header>

      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <SettingsPanel
            scoring={scoring}
            onScoringChange={setScoring}
            league={league}
            onLeagueChange={setLeague}
            weights={weights}
            onWeightsChange={setWeights}
            availableSources={allSources}
            onReset={resetAll}
          />
        </div>

        {error && <div className={styles.statusMessageError}>{error}</div>}
        {!error && !players && <div className={styles.statusMessage}>Loading players…</div>}

        {!error && players && view === "board" && (
          <div className={styles.boardCol}>
            <SuggestedPick player={suggestedPick} onAddToTeam={addToTeam} />
            <PlayersTable
              players={ranked}
              allSources={allSources}
              draftedIds={draftedSet}
              myTeamIds={myTeamSet}
              onToggleDrafted={toggleDrafted}
              onClearDrafted={clearDrafted}
              onAddToTeam={addToTeam}
              onRemoveFromTeam={removeFromTeam}
            />
          </div>
        )}

        {!error && players && view === "team" && (
          <TeamView roster={roster} onRemoveFromTeam={removeFromTeam} />
        )}
      </div>
    </div>
  );
}
