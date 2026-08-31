"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RankedPlayer } from "@/lib/ranking";
import { Position, POSITIONS } from "@/lib/types";
import styles from "./PlayersTable.module.css";

type SortKey = "rank" | "seasonPoints" | "pointsPerGame" | "vorp" | "compositeScore";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "#" },
  { key: "seasonPoints", label: "Season Pts" },
  { key: "pointsPerGame", label: "Pts/Gm" },
  { key: "vorp", label: "VORP" },
  { key: "compositeScore", label: "Score" },
];

const COLUMN_COUNT = COLUMNS.length + 5; // + draft checkbox, Player, Pos, Sources, Team action

const ROW_HEIGHT = 44;

function badgeClass(position: Position) {
  return {
    QB: "badge-qb",
    RB: "badge-rb",
    WR: "badge-wr",
    TE: "badge-te",
  }[position];
}

export function PlayersTable({
  players,
  allSources,
  draftedIds,
  myTeamIds,
  onToggleDrafted,
  onClearDrafted,
  onAddToTeam,
  onRemoveFromTeam,
}: {
  players: RankedPlayer[];
  allSources: string[];
  draftedIds: Set<string>;
  myTeamIds: Set<string>;
  onToggleDrafted: (id: string) => void;
  onClearDrafted: () => void;
  onAddToTeam: (id: string) => void;
  onRemoveFromTeam: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showDrafted, setShowDrafted] = useState(false);

  const filtered = useMemo(() => {
    let list = players;
    if (!showDrafted) list = list.filter((p) => !draftedIds.has(p.id));
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [players, posFilter, search, showDrafted, draftedIds]);

  const sorted = useMemo(() => {
    if (sortKey === "rank") {
      // "rank" is the incoming compositeScore-based order from rankPlayers();
      // asc = best first (already true by construction).
      return sortDir === "asc" ? filtered : [...filtered].reverse();
    }
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? -diff : diff;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" ? "asc" : "desc");
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.posFilters}>
          {(["ALL", ...POSITIONS] as const).map((p) => (
            <button
              key={p}
              className={posFilter === p ? styles.posButtonActive : styles.posButton}
              onClick={() => setPosFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          className={showDrafted ? styles.posButtonActive : styles.posButton}
          onClick={() => setShowDrafted((v) => !v)}
        >
          {showDrafted ? "Showing drafted" : "Hide drafted"}
        </button>
        {draftedIds.size > 0 && (
          <button className={styles.clearButton} onClick={onClearDrafted}>
            Clear draft ({draftedIds.size})
          </button>
        )}
        <span className={styles.count}>{sorted.length} players</span>
      </div>

      <div className={styles.tableContainer} ref={scrollRef}>
        <table className={styles.table}>
          <thead className={styles.headerRow}>
            <tr>
              <th className={styles.th} title="Mark as drafted">
                ✓
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={sortKey === col.key ? styles.thActive : styles.th}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className={styles.sortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
              <th className={styles.th}>Player</th>
              <th className={styles.th}>Pos</th>
              <th className={styles.th}>Sources</th>
              <th className={styles.th}>Team</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className={styles.emptyState} colSpan={COLUMN_COUNT}>
                  No players match your filters.
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr style={{ height: paddingTop }}>
                <td colSpan={COLUMN_COUNT} />
              </tr>
            )}
            {virtualItems.map((vi) => {
              const p = sorted[vi.index];
              const isDrafted = draftedIds.has(p.id);
              const isMine = myTeamIds.has(p.id);
              return (
                <tr
                  className={isDrafted ? `${styles.row} ${styles.rowDrafted}` : styles.row}
                  key={p.id}
                  style={{ height: ROW_HEIGHT }}
                >
                  <td className={`${styles.td} ${styles.checkCell}`}>
                    <input
                      type="checkbox"
                      checked={isDrafted}
                      onChange={() => onToggleDrafted(p.id)}
                      aria-label={`Mark ${p.name} as drafted`}
                    />
                  </td>
                  <td className={`${styles.td} ${styles.rankCell}`}>{vi.index + 1}</td>
                  <td className={`${styles.td} ${styles.numCell}`}>{p.seasonPoints.toFixed(1)}</td>
                  <td className={`${styles.td} ${styles.numCell}`}>{p.pointsPerGame.toFixed(1)}</td>
                  <td
                    className={`${styles.td} ${styles.numCell} ${p.vorp >= 0 ? styles.positive : styles.negative}`}
                  >
                    {p.vorp >= 0 ? "+" : ""}
                    {p.vorp.toFixed(1)}
                  </td>
                  <td className={`${styles.td} ${styles.numCellStrong}`}>
                    {p.compositeScore.toFixed(1)}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.playerCell}>
                      <span className={styles.playerName}>{p.name}</span>
                      <span className={styles.playerTeam}>
                        {p.team ?? "FA"}
                        {p.status && p.status !== "Active" ? ` · ${p.status}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <span className={`badge ${badgeClass(p.position)}`}>{p.position}</span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.sourcesCell} title={p.sources.map((s) => s.source).join(", ")}>
                      {allSources.map((source) => (
                        <span
                          key={source}
                          className={
                            p.sources.some((s) => s.source === source)
                              ? styles.sourceDotActive
                              : styles.sourceDot
                          }
                        />
                      ))}
                    </div>
                  </td>
                  <td className={styles.td}>
                    {isMine ? (
                      <button
                        className={styles.teamButtonActive}
                        onClick={() => onRemoveFromTeam(p.id)}
                      >
                        ★ Mine
                      </button>
                    ) : isDrafted ? (
                      <button className={styles.teamButtonDisabled} disabled>
                        Taken
                      </button>
                    ) : (
                      <button className={styles.teamButton} onClick={() => onAddToTeam(p.id)}>
                        + Team
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={COLUMN_COUNT} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
