// Analyzer data model: the Debrief the view renders. Pure data, built from a
// SessionModel by deterministic rules (plan §5). LLM enrichment (Phase 2) will
// populate the same shapes, so the view never needs to change.

export type HighlightType = "decision" | "correction";

export type HighlightKind =
  | "ask" // AskUserQuestion — strongest decision signal
  | "plan" // ExitPlanMode approval
  | "directive" // explicit user pick among offered options
  | "interruption" // [Request interrupted by user]
  | "countermand" // "why did you…", "no,…", "undo…"
  | "churn"; // same file edited many times

export interface EvidenceTurn {
  who: "user" | "agent";
  text: string;
  at: Date;
}

export interface Option {
  label: string;
  chosen: boolean;
}

/**
 * One ranked moment on the timeline. Decisions and corrections share this shape;
 * the view branches on `type` (Options/Why for decisions, What-happened/Takeaway
 * for corrections). Follows the QOC schema (plan §1) where applicable.
 */
export interface Highlight {
  id: string;
  type: HighlightType;
  kind: HighlightKind;
  at: Date;
  /** set when the moment spans two turns (e.g. offered-then-chosen). */
  endAt?: Date;
  turnIndex: number;
  /** short label shown on the timeline (≈24 chars). */
  title: string;
  /** card headline (one clause). */
  heading: string;
  /** considered alternatives, chosen flagged (decisions only). */
  options: Option[];
  /** decision: rationale prose · correction: what happened. */
  why: string;
  /** decision: chosen path in one sentence · correction: takeaway. */
  resolution: string;
  /** why-criteria; empty in deterministic MVP1. */
  criteria: string[];
  decider: "user" | "agent" | "user-approved";
  evidence: EvidenceTurn[];
  /** lower = higher priority; used for the top-6 cap, not for display order. */
  rank: number;
}

export interface Stats {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  durationLabel: string;
  turnCount: number;
  decisionCount: number;
  correctionCount: number;
  warningCount: number;
}

export interface TapeAct {
  tag: string;
  text: string;
  isError: boolean;
}

export interface TapeRow {
  turnIndex: number;
  at: Date;
  timeLabel: string;
  userLine: string;
  oneLiner: string;
  hasDecision: boolean;
  hasCorrection: boolean;
  hasError: boolean;
  acts: TapeAct[];
}

export interface Debrief {
  sessionId: string;
  headline: string;
  deck: string;
  stats: Stats;
  /** capped at 6, chronological order (plan §5). */
  highlights: Highlight[];
  tape: TapeRow[];
}

/** Highlights above this count are ranked and truncated (Cowan 2001). */
export const HIGHLIGHT_CAP = 6;
