// Parser data model: raw JSONL records and the normalized SessionModel.
// Everything here is plain immutable data — the parser never mutates in place.

/** A content block inside a message. Unknown block types are tolerated. */
export type ContentBlock =
  | { type: "text"; text?: string }
  | { type: "thinking"; thinking?: string }
  | { type: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id?: string; content?: unknown; is_error?: boolean }
  | { type: string; [k: string]: unknown };

export interface RawMessage {
  role?: string;
  content?: string | ContentBlock[];
}

/** One parsed JSONL line. Only fields we rely on are typed; the rest pass through. */
export interface RawRecord {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  timestamp?: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  message?: RawMessage;
  [k: string]: unknown;
}

export interface ParseResult {
  records: RawRecord[];
  /** One entry per malformed/skipped line — surfaced unobtrusively in the UI. */
  warnings: string[];
}

/** A single tool invocation within a turn's episode. */
export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  /** true when the corresponding tool_result carried is_error. */
  isError: boolean;
  /** file paths touched (from file_path / notebook_path / path inputs). */
  filePaths: string[];
  /** short text of the tool_result, when present (e.g. AskUserQuestion answer). */
  resultText: string;
}

/**
 * A human turn and everything the agent did in response (the "episode").
 * One Turn per genuine human user message; system-injected records are excluded.
 */
export interface Turn {
  index: number;
  at: Date;
  /** raw human text (may include command/interruption markers). */
  userText: string;
  /** true when this turn is a `[Request interrupted by user…]` marker. */
  interrupted: boolean;
  /** true when the turn is a `<command-name>…` slash-command invocation. */
  isCommand: boolean;
  /** concatenated assistant text across the episode. */
  assistantText: string;
  /** first non-empty assistant text of the episode (tape one-liner source). */
  assistantSummaryText: string;
  /** tool calls the agent made in this episode, in order. */
  toolCalls: ToolCall[];
}

export interface SessionModel {
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  /** one per genuine human turn, in chronological order. */
  turns: Turn[];
  /** parse warnings (malformed lines), carried through for the UI. */
  warnings: string[];
}
