import type { SessionModel } from "../parser/types";
import type { Highlight, Stats } from "./types";

/** "1h 24m", "42m", or "under a minute". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return "under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function computeStats(model: SessionModel, highlights: Highlight[]): Stats {
  const durationMs = Math.max(0, model.endedAt.getTime() - model.startedAt.getTime());
  return {
    startedAt: model.startedAt,
    endedAt: model.endedAt,
    durationMs,
    durationLabel: formatDuration(durationMs),
    turnCount: model.turns.length,
    decisionCount: highlights.filter((h) => h.type === "decision").length,
    correctionCount: highlights.filter((h) => h.type === "correction").length,
    warningCount: model.warnings.length,
  };
}
