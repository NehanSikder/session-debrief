import type { Highlight } from "./types";
import { HIGHLIGHT_CAP } from "./types";

/**
 * Merge decisions + frictions, rank, cap at 6 (Cowan 2001), and return in
 * chronological order for display (plan §5). Ranking order:
 * ask (1) > plan (2) > interruption/countermand (3) > directive (4) > churn (5).
 * Ties broken by time so the cap keeps the earliest of equal-priority moments.
 */
export function selectHighlights(candidates: Highlight[]): Highlight[] {
  const byPriority = [...candidates].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.at.getTime() - b.at.getTime();
  });
  const kept = byPriority.slice(0, HIGHLIGHT_CAP);
  return kept.sort((a, b) => a.at.getTime() - b.at.getTime() || a.turnIndex - b.turnIndex);
}
