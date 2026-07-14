import type { SessionModel, ToolCall, Turn } from "../parser/types";
import type { EvidenceTurn, Highlight, Option } from "./types";
import { cleanUserText, firstLine, stripRecommended, tidy, truncate } from "./text";

// Matches the "question"="answer" pairs Claude Code writes into an
// AskUserQuestion tool_result, tolerant of the two known lead-ins
// ("Your questions have been answered…" / "User has answered your questions…").
const QA_PAIR_RE = /"([^"]+)"\s*=\s*"([^"]+)"/g;

interface AskInput {
  questions?: Array<{
    question?: string;
    options?: Array<{ label?: string }>;
  }>;
}

function parseAnswers(resultText: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of resultText.matchAll(QA_PAIR_RE)) map.set(m[1].trim(), m[2].trim());
  return map;
}

function anchorUserEvidence(turn: Turn): EvidenceTurn | null {
  if (turn.isCommand || turn.interrupted) return null;
  const text = cleanUserText(turn.userText);
  if (!text) return null;
  return { who: "user", text: truncate(text, 240), at: turn.at };
}

/** Build a decision Highlight from one answered AskUserQuestion call. */
function askDecision(turn: Turn, call: ToolCall): Highlight | null {
  if (call.isError) return null; // rejected/cancelled ask is not a decision
  const answers = parseAnswers(call.resultText);
  if (answers.size === 0) return null;

  const input = call.input as AskInput;
  const q = input.questions?.[0];
  const question = tidy(q?.question ?? "");
  const offered = (q?.options ?? [])
    .map((o) => tidy(o.label ?? ""))
    .filter(Boolean);

  // The answer for the first question, else the first answer we found.
  const answer =
    (question && answers.get(question)) ?? [...answers.values()][0] ?? "";
  if (!answer) return null;

  const chosenSet = new Set(
    answer
      .split(/,\s*/)
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );
  const options: Option[] = offered.map((label) => ({
    label,
    chosen: chosenSet.has(label.toLowerCase()),
  }));
  // Custom ("Other") answer that matches no offered option.
  if (!options.some((o) => o.chosen)) {
    options.unshift({ label: answer, chosen: true });
  }

  const outcome = stripRecommended(answer);
  const evidence: EvidenceTurn[] = [];
  const anchor = anchorUserEvidence(turn);
  if (anchor) evidence.push(anchor);
  if (question) evidence.push({ who: "agent", text: question, at: turn.at });
  evidence.push({ who: "user", text: outcome, at: turn.at });

  return {
    id: `ask-${turn.index}`,
    type: "decision",
    kind: "ask",
    at: turn.at,
    turnIndex: turn.index,
    title: truncate(outcome, 26),
    heading: /[.!?]$/.test(outcome) ? outcome : `${outcome}.`,
    options,
    why: question ? `Chosen in answer to: “${question}”` : "Chosen from the offered options.",
    resolution: outcome,
    criteria: [],
    decider: "user",
    evidence,
    rank: 1,
  };
}

/** Build a decision from an ExitPlanMode call approved by the next human turn. */
function planDecision(turns: Turn[], turnIdx: number, call: ToolCall): Highlight | null {
  const turn = turns[turnIdx];
  // Approval = a following human turn that isn't a countermand/interruption.
  const next = turns[turnIdx + 1];
  if (!next || next.interrupted) return null;
  const plan = typeof call.input.plan === "string" ? call.input.plan : "";
  const heading = tidy(firstLine(plan).replace(/^#+\s*/, "")) || "Adopted the plan.";

  return {
    id: `plan-${turn.index}`,
    type: "decision",
    kind: "plan",
    at: turn.at,
    turnIndex: turn.index,
    title: truncate(heading, 26),
    heading: /[.!?]$/.test(heading) ? heading : `${heading}.`,
    options: [
      { label: "Proceed with the proposed plan", chosen: true },
      { label: "Revise before implementing", chosen: false },
    ],
    why: "Plan presented via ExitPlanMode and approved by the next turn.",
    resolution: truncate(heading, 120),
    criteria: [],
    decider: "user-approved",
    evidence: [
      { who: "agent", text: truncate(tidy(plan), 240) || heading, at: turn.at },
      { who: "user", text: cleanUserText(next.userText) || "Approved.", at: next.at },
    ],
    rank: 2,
  };
}

/** Extract all decisions (plan §5), one per qualifying signal. */
export function extractDecisions(model: SessionModel): Highlight[] {
  const out: Highlight[] = [];
  model.turns.forEach((turn, idx) => {
    for (const call of turn.toolCalls) {
      if (call.name === "AskUserQuestion") {
        const d = askDecision(turn, call);
        if (d) out.push(d);
      } else if (call.name === "ExitPlanMode") {
        const d = planDecision(model.turns, idx, call);
        if (d) out.push(d);
      }
    }
  });
  return out;
}
