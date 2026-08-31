"use client";

import { RankedPlayer } from "@/lib/ranking";
import styles from "./SuggestedPick.module.css";

export function SuggestedPick({
  player,
  onAddToTeam,
}: {
  player: RankedPlayer | null;
  onAddToTeam: (id: string) => void;
}) {
  if (!player) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.info}>
        <div className={styles.eyebrow}>Best pick available for your team</div>
        <div className={styles.nameRow}>
          <span className={styles.name}>{player.name}</span>
          <span className={`badge badge-${player.position.toLowerCase()}`}>{player.position}</span>
        </div>
        <span className={styles.meta}>
          {player.team ?? "FA"} · {player.compositeScore.toFixed(1)} score · {player.vorp >= 0 ? "+" : ""}
          {player.vorp.toFixed(1)} VORP
        </span>
      </div>
      <button className={styles.addButton} onClick={() => onAddToTeam(player.id)}>
        + Add to Team
      </button>
    </div>
  );
}
