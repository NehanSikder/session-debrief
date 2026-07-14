import type { ToolCall, Turn, SessionModel } from "../parser/types";
import type { Highlight, TapeAct, TapeRow } from "./types";
import { cleanUserText, firstLine, tidy, truncate } from "./text";
import { formatClock } from "./time";

const TAG_BY_TOOL: Record<string, string> = {
  AskUserQuestion: "ask",
  ExitPlanMode: "plan",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Bash: "cmd",
  Read: "read",
  Grep: "read",
  Glob: "read",
  WebSearch: "web",
  WebFetch: "web",
  Task: "agent",
  Agent: "agent",
  TodoWrite: "todo",
};

const MAX_ACTS = 8;

function tagFor(name: string): string {
  return TAG_BY_TOOL[name] ?? name.slice(0, 4).toLowerCase();
}

/** A short human target for a tool call: file, command, or query. */
function targetFor(call: ToolCall): string {
  if (call.filePaths.length) return call.filePaths[0].split("/").pop() || call.filePaths[0];
  const input = call.input;
  const cmd = input.command ?? input.query ?? input.pattern ?? input.url ?? input.prompt;
  if (typeof cmd === "string" && cmd.trim()) return truncate(tidy(cmd), 60);
  if (call.name === "AskUserQuestion") {
    const q = (input as { questions?: Array<{ question?: string }> }).questions?.[0]?.question;
    if (q) return truncate(tidy(q), 60);
  }
  return "";
}

/** Collapse a turn's tool calls into compact, de-duplicated acts. */
function buildActs(turn: Turn): TapeAct[] {
  const acts: TapeAct[] = [];
  for (const call of turn.toolCalls) {
    const tag = tagFor(call.name);
    const target = targetFor(call);
    const prev = acts[acts.length - 1];
    if (prev && prev.tag === tag && prev.text.replace(/ ×\d+$/, "") === target) {
      const m = prev.text.match(/ ×(\d+)$/);
      const n = m ? Number(m[1]) + 1 : 2;
      prev.text = `${target} ×${n}`;
      if (call.isError) prev.isError = true;
      continue;
    }
    acts.push({ tag, text: target, isError: call.isError });
  }
  if (acts.length > MAX_ACTS) {
    const extra = acts.length - MAX_ACTS;
    return [...acts.slice(0, MAX_ACTS), { tag: "…", text: `+${extra} more`, isError: false }];
  }
  return acts;
}

function summarize(turn: Turn, acts: TapeAct[]): string {
  const summary = tidy(firstLine(turn.assistantSummaryText));
  if (summary) return truncate(summary, 110);
  if (acts.length === 0) return "";
  const counts = new Map<string, number>();
  for (const a of acts) counts.set(a.tag, (counts.get(a.tag) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${n} ${t}`).join(" · ");
}

/** Build the tape: one row per human turn, with derived acts and glyphs. */
export function buildTape(model: SessionModel, candidates: Highlight[]): TapeRow[] {
  const decisionTurns = new Set(
    candidates.filter((h) => h.type === "decision").map((h) => h.turnIndex),
  );
  const correctionTurns = new Set(
    candidates.filter((h) => h.type === "correction").map((h) => h.turnIndex),
  );

  return model.turns.map((turn) => {
    const acts = buildActs(turn);
    const userLine = truncate(cleanUserText(turn.userText) || "(no text)", 110);
    return {
      turnIndex: turn.index,
      at: turn.at,
      timeLabel: formatClock(turn.at),
      userLine,
      oneLiner: summarize(turn, acts),
      hasDecision: decisionTurns.has(turn.index),
      hasCorrection: correctionTurns.has(turn.index),
      hasError: turn.toolCalls.some((c) => c.isError),
      acts,
    };
  });
}
