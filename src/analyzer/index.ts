import type { SessionModel } from "../parser/types";
import type { Debrief } from "./types";
import { extractDecisions } from "./decisions";
import { extractFrictions } from "./friction";
import { selectHighlights } from "./highlights";
import { computeStats } from "./stats";
import { buildTape } from "./tape";
import { cleanUserText } from "./text";

export type * from "./types";
export { formatDuration } from "./stats";
export { formatClock, formatDate } from "./time";

function buildHeadline(decisions: number, corrections: number, duration: string): string {
  const d = `${decisions} decision${decisions === 1 ? "" : "s"}`;
  const c = `${corrections} correction${corrections === 1 ? "" : "s"}`;
  return `${d}, ${c} in ${duration}`;
}

/** The first substantive human turn, as the deck line under the headline. */
function buildDeck(model: SessionModel): string {
  for (const turn of model.turns) {
    if (turn.isCommand || turn.interrupted) continue;
    const text = cleanUserText(turn.userText);
    if (text) return text;
  }
  return "No human prompt found in this session.";
}

/**
 * Analyze a SessionModel into a Debrief (plan §5). Pure and deterministic:
 * decisions + frictions → ranked, capped highlights; a templated headline; the
 * full tape. The analyzer is swappable — Phase 2 LLM enrichment fills the same
 * Debrief shape.
 */
export function analyze(model: SessionModel): Debrief {
  const candidates = [...extractDecisions(model), ...extractFrictions(model)];
  const highlights = selectHighlights(candidates);
  const stats = computeStats(model, highlights);

  return {
    sessionId: model.sessionId,
    headline: buildHeadline(stats.decisionCount, stats.correctionCount, stats.durationLabel),
    deck: buildDeck(model),
    stats,
    highlights,
    tape: buildTape(model, candidates),
  };
}
