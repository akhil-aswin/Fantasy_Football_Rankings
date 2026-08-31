"use client";

import { ScoringSettings, LeagueSettings, RankingWeights, SCORING_PRESETS } from "@/lib/ranking";
import styles from "./SettingsPanel.module.css";

const PRESET_LABELS: { key: keyof typeof SCORING_PRESETS; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "halfPpr", label: "Half PPR" },
  { key: "ppr", label: "Full PPR" },
];

function presetMatches(scoring: ScoringSettings, presetKey: keyof typeof SCORING_PRESETS) {
  const preset = SCORING_PRESETS[presetKey];
  return (Object.keys(preset) as (keyof ScoringSettings)[]).every(
    (k) => Math.abs(preset[k] - scoring[k]) < 1e-9
  );
}

function Slider({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabelRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <span className={styles.fieldValue}>{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className={styles.miniField}>
      <label className={styles.miniLabel}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export interface SettingsPanelProps {
  scoring: ScoringSettings;
  onScoringChange: (s: ScoringSettings) => void;
  league: LeagueSettings;
  onLeagueChange: (l: LeagueSettings) => void;
  weights: RankingWeights;
  onWeightsChange: (w: RankingWeights) => void;
  availableSources: string[];
  onReset: () => void;
}

export function SettingsPanel({
  scoring,
  onScoringChange,
  league,
  onLeagueChange,
  weights,
  onWeightsChange,
  availableSources,
  onReset,
}: SettingsPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Scoring Format</div>
        <div className={styles.presetRow}>
          {PRESET_LABELS.map(({ key, label }) => (
            <button
              key={key}
              className={presetMatches(scoring, key) ? styles.presetButtonActive : styles.presetButton}
              onClick={() => onScoringChange({ ...SCORING_PRESETS[key] })}
            >
              {label}
            </button>
          ))}
        </div>

        <Slider
          label="Points per reception"
          value={scoring.rec}
          displayValue={scoring.rec.toFixed(2)}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v) => onScoringChange({ ...scoring, rec: v })}
        />
        <Slider
          label="TE reception bonus"
          value={scoring.teReceptionBonus}
          displayValue={`+${scoring.teReceptionBonus.toFixed(2)}`}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onScoringChange({ ...scoring, teReceptionBonus: v })}
        />

        <details className={styles.disclosure}>
          <summary>Advanced scoring</summary>
          <div className={styles.advancedBody}>
            <div className={styles.gridInputs}>
              <NumberField
                label="Pass yd / pt"
                value={scoring.passYd === 0 ? 0 : Math.round(1 / scoring.passYd)}
                onChange={(v) => onScoringChange({ ...scoring, passYd: v > 0 ? 1 / v : 0 })}
                min={1}
              />
              <NumberField
                label="Pass TD pts"
                value={scoring.passTd}
                onChange={(v) => onScoringChange({ ...scoring, passTd: v })}
              />
              <NumberField
                label="INT pts"
                value={scoring.passInt}
                onChange={(v) => onScoringChange({ ...scoring, passInt: v })}
              />
              <NumberField
                label="Rush yd / pt"
                value={scoring.rushYd === 0 ? 0 : Math.round(1 / scoring.rushYd)}
                onChange={(v) => onScoringChange({ ...scoring, rushYd: v > 0 ? 1 / v : 0 })}
                min={1}
              />
              <NumberField
                label="Rush TD pts"
                value={scoring.rushTd}
                onChange={(v) => onScoringChange({ ...scoring, rushTd: v })}
              />
              <NumberField
                label="Rec yd / pt"
                value={scoring.recYd === 0 ? 0 : Math.round(1 / scoring.recYd)}
                onChange={(v) => onScoringChange({ ...scoring, recYd: v > 0 ? 1 / v : 0 })}
                min={1}
              />
              <NumberField
                label="Rec TD pts"
                value={scoring.recTd}
                onChange={(v) => onScoringChange({ ...scoring, recTd: v })}
              />
              <NumberField
                label="Fumble lost pts"
                value={scoring.fumbleLost}
                onChange={(v) => onScoringChange({ ...scoring, fumbleLost: v })}
              />
            </div>
          </div>
        </details>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>League Settings</div>
        <div className={styles.gridInputs}>
          <NumberField
            label="Teams"
            value={league.teams}
            min={2}
            onChange={(v) => onLeagueChange({ ...league, teams: Math.max(2, v) })}
          />
          <NumberField
            label="QB slots"
            value={league.starters.QB}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, starters: { ...league.starters, QB: v } })}
          />
          <NumberField
            label="RB slots"
            value={league.starters.RB}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, starters: { ...league.starters, RB: v } })}
          />
          <NumberField
            label="WR slots"
            value={league.starters.WR}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, starters: { ...league.starters, WR: v } })}
          />
          <NumberField
            label="TE slots"
            value={league.starters.TE}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, starters: { ...league.starters, TE: v } })}
          />
          <NumberField
            label="FLEX slots"
            value={league.starters.FLEX}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, starters: { ...league.starters, FLEX: v } })}
          />
          <NumberField
            label="Superflex"
            value={league.starters.SUPERFLEX}
            min={0}
            onChange={(v) =>
              onLeagueChange({ ...league, starters: { ...league.starters, SUPERFLEX: v } })
            }
          />
          <NumberField
            label="Bench slots"
            value={league.bench}
            min={0}
            onChange={(v) => onLeagueChange({ ...league, bench: Math.max(0, v) })}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Ranking Model</div>
        <Slider
          label="Projections ← trust → History"
          value={weights.trustProjection}
          displayValue={`${Math.round(weights.trustProjection * 100)}% proj`}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onWeightsChange({ ...weights, trustProjection: v })}
        />
        <Slider
          label="Positional scarcity influence"
          value={weights.vorpInfluence}
          displayValue={weights.vorpInfluence.toFixed(2)}
          min={0}
          max={2}
          step={0.1}
          onChange={(v) => onWeightsChange({ ...weights, vorpInfluence: v })}
        />

        <details className={styles.disclosure}>
          <summary>Advanced ranking</summary>
          <div className={styles.advancedBody}>
            <Slider
              label="Recency weight (older seasons)"
              value={weights.seasonRecencyDecay}
              displayValue={weights.seasonRecencyDecay.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onWeightsChange({ ...weights, seasonRecencyDecay: v })}
            />
            {availableSources.map((source) => (
              <Slider
                key={source}
                label={`Source weight: ${source}`}
                value={weights.sourceWeights[source] ?? 1}
                displayValue={(weights.sourceWeights[source] ?? 1).toFixed(2)}
                min={0}
                max={2}
                step={0.1}
                onChange={(v) =>
                  onWeightsChange({
                    ...weights,
                    sourceWeights: { ...weights.sourceWeights, [source]: v },
                  })
                }
              />
            ))}
          </div>
        </details>
      </div>

      <button className={styles.resetButton} onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  );
}
