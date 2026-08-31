"use client";

import { RankedPlayer, RosterSlot } from "@/lib/ranking";
import styles from "./TeamView.module.css";

function PlayerRow({
  player,
  onRemove,
  score,
}: {
  player: RankedPlayer;
  onRemove: () => void;
  score: number;
}) {
  return (
    <div className={styles.slotPlayer}>
      <span className={styles.playerName}>{player.name}</span>
      <span className={styles.playerMeta}>
        {player.team ?? "FA"} · {player.position}
      </span>
      <span style={{ marginLeft: "auto" }} />
      <span className={styles.score}>{score.toFixed(1)}</span>
      <button className={styles.removeButton} onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function SlotList({
  slots,
  onRemoveFromTeam,
}: {
  slots: RosterSlot[];
  onRemoveFromTeam: (id: string) => void;
}) {
  return (
    <div className={styles.slotList}>
      {slots.map((slot) => (
        <div key={slot.id} className={slot.player ? styles.slotRow : styles.slotEmpty}>
          <span className={styles.slotLabel}>{slot.label}</span>
          {slot.player ? (
            <PlayerRow
              player={slot.player}
              score={slot.player.seasonPoints}
              onRemove={() => onRemoveFromTeam(slot.player!.id)}
            />
          ) : (
            <span className={styles.emptyLabel}>Empty slot</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function TeamView({
  roster,
  onRemoveFromTeam,
}: {
  roster: { starterSlots: RosterSlot[]; benchSlots: RosterSlot[]; overflow: RankedPlayer[] };
  onRemoveFromTeam: (id: string) => void;
}) {
  const { starterSlots, benchSlots, overflow } = roster;
  const allPlayers = [
    ...starterSlots.map((s) => s.player).filter((p): p is RankedPlayer => !!p),
    ...benchSlots.map((s) => s.player).filter((p): p is RankedPlayer => !!p),
    ...overflow,
  ];
  const totalPoints = allPlayers.reduce((sum, p) => sum + p.seasonPoints, 0);
  const startersPoints = starterSlots.reduce((sum, s) => sum + (s.player?.seasonPoints ?? 0), 0);

  if (allPlayers.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.emptyState}>
          No players on your team yet — use &ldquo;+ Team&rdquo; on the Board to start drafting.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Roster size</span>
          <span className={styles.statValue}>{allPlayers.length}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Starters proj. pts</span>
          <span className={styles.statValue}>{startersPoints.toFixed(1)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total roster proj. pts</span>
          <span className={styles.statValue}>{totalPoints.toFixed(1)}</span>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>Starting Lineup</div>
        <SlotList slots={starterSlots} onRemoveFromTeam={onRemoveFromTeam} />
      </div>

      <div>
        <div className={styles.sectionTitle}>Bench</div>
        <SlotList slots={benchSlots} onRemoveFromTeam={onRemoveFromTeam} />
      </div>

      {overflow.length > 0 && (
        <div>
          <div className={styles.sectionTitle}>Overflow (no open slot)</div>
          <div className={styles.slotList}>
            {overflow.map((p) => (
              <div key={p.id} className={styles.slotRow}>
                <span className={styles.slotLabel}>—</span>
                <PlayerRow player={p} score={p.seasonPoints} onRemove={() => onRemoveFromTeam(p.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
