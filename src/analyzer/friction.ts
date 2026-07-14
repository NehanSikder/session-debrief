import type { SessionModel, Turn } from "../parser/types";
import type { EvidenceTurn, Highlight } from "./types";
import { cleanUserText, tidy, truncate } from "./text";

// Conservative countermand openers (plan §5): a human turn that pushes back on
// what the agent just did. Anchored to the start of the turn to avoid matching
// these words mid-sentence.
const COUNTERMAND_RE =
  /^\s*(why did you|why didn'?t you|no,|no\.|nope|that'?s not|thats not|that is not|don'?t |do not |undo|revert|stop|wait,|actually,|instead of|you shouldn'?t|you should not)/i;

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const CHURN_THRESHOLD = 4; // same file edited ≥4× in one episode

function agentReply(turn: Turn): EvidenceTurn | null {
  const t = tidy(turn.assistantSummaryText);
  return t ? { who: "agent", text: truncate(t, 240), at: turn.at } : null;
}

function interruption(turn: Turn): Highlight {
  const evidence: EvidenceTurn[] = [
    { who: "user", text: truncate(cleanUserText(turn.userText) || "[Request interrupted by user]", 200), at: turn.at },
  ];
  const reply = agentReply(turn);
  if (reply) evidence.push(reply);
  return {
    id: `int-${turn.index}`,
    type: "correction",
    kind: "interruption",
    at: turn.at,
    turnIndex: turn.index,
    title: "Interruption",
    heading: "You interrupted the agent mid-action.",
    options: [],
    why: "The turn carries a “[Request interrupted by user]” marker. The agent was stopped before finishing.",
    resolution: "Flow was redirected; check the next turn for what changed.",
    criteria: [],
    decider: "user",
    evidence,
    rank: 3,
  };
}

function countermand(turn: Turn): Highlight {
  const text = cleanUserText(turn.userText);
  const evidence: EvidenceTurn[] = [{ who: "user", text: truncate(text, 220), at: turn.at }];
  const reply = agentReply(turn);
  if (reply) evidence.push(reply);
  return {
    id: `cm-${turn.index}`,
    type: "correction",
    kind: "countermand",
    at: turn.at,
    turnIndex: turn.index,
    title: truncate(text, 22),
    heading: truncate(text, 90),
    options: [],
    why: "A course-correction from you. The turn pushes back on the agent's previous action.",
    resolution: "The agent adjusted in response.",
    criteria: [],
    decider: "user",
    evidence,
    rank: 3,
  };
}

/** Count file edits per path within a turn's episode. */
function churnFile(turn: Turn): { path: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const call of turn.toolCalls) {
    if (!EDIT_TOOLS.has(call.name)) continue;
    for (const p of call.filePaths) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let top: { path: string; count: number } | null = null;
  for (const [path, count] of counts) {
    if (count >= CHURN_THRESHOLD && (!top || count > top.count)) top = { path, count };
  }
  return top;
}

function churn(turn: Turn, file: { path: string; count: number }): Highlight {
  const name = file.path.split("/").pop() || file.path;
  return {
    id: `churn-${turn.index}`,
    type: "correction",
    kind: "churn",
    at: turn.at,
    turnIndex: turn.index,
    title: `Churn on ${name}`,
    heading: `${name} was edited ${file.count} times in one turn.`,
    options: [],
    why: `The agent revised ${name} ${file.count} times within a single episode, a sign of trial-and-error or unclear requirements.`,
    resolution: "Repeated edits converged on the final version.",
    criteria: [],
    decider: "agent",
    evidence: [
      { who: "user", text: truncate(cleanUserText(turn.userText), 200), at: turn.at },
    ],
    rank: 5,
  };
}

/** Extract all frictions (plan §5). Tool errors are surfaced in the tape (not
 *  promoted to highlights here) unless the episode also has a countermand. */
export function extractFrictions(model: SessionModel): Highlight[] {
  const out: Highlight[] = [];
  for (const turn of model.turns) {
    if (turn.interrupted) {
      out.push(interruption(turn));
      continue; // one correction per turn
    }
    if (COUNTERMAND_RE.test(cleanUserText(turn.userText))) {
      out.push(countermand(turn));
      continue;
    }
    const file = churnFile(turn);
    if (file) out.push(churn(turn, file));
  }
  return out;
}
