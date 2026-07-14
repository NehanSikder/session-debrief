import { describe, it, expect } from "vitest";
import { parseSession } from "../src/parser";
import type { SessionModel, ToolCall, Turn } from "../src/parser/types";
import { analyze } from "../src/analyzer";
import { extractDecisions } from "../src/analyzer/decisions";
import { extractFrictions } from "../src/analyzer/friction";
import { selectHighlights } from "../src/analyzer/highlights";
import { formatDuration } from "../src/analyzer/stats";
import { cleanUserText, truncate, stripRecommended } from "../src/analyzer/text";
import type { Highlight } from "../src/analyzer/types";
import { fixture } from "./helpers";

// --- tiny test-model builders -------------------------------------------------
let clock = Date.UTC(2026, 0, 1, 12, 0, 0);
function makeTurn(over: Partial<Turn> & { userText: string }): Turn {
  clock += 60000;
  return {
    index: 0,
    at: new Date(clock),
    interrupted: false,
    isCommand: false,
    assistantText: "",
    assistantSummaryText: "",
    toolCalls: [],
    ...over,
  };
}
function makeCall(over: Partial<ToolCall> & { name: string }): ToolCall {
  return { input: {}, isError: false, filePaths: [], resultText: "", ...over };
}
function makeModel(turns: Turn[]): SessionModel {
  return {
    sessionId: "t",
    startedAt: turns[0]?.at ?? new Date(0),
    endedAt: turns[turns.length - 1]?.at ?? new Date(0),
    turns: turns.map((t, i) => ({ ...t, index: i })),
    warnings: [],
  };
}

// --- decisions ----------------------------------------------------------------
describe("extractDecisions — AskUserQuestion", () => {
  it("tiny fixture yields exactly one decision (the rejected ask is excluded)", () => {
    const model = parseSession(fixture("tiny-ask-interrupt"));
    const decisions = extractDecisions(model);
    expect(decisions).toHaveLength(1);
    const d = decisions[0];
    expect(d.type).toBe("decision");
    expect(d.kind).toBe("ask");
    expect(d.decider).toBe("user");
    const chosen = d.options.filter((o) => o.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].label).toMatch(/swift/i);
    expect(d.options.length).toBeGreaterThan(1);
  });

  it("medium fixture yields two decisions; design one", () => {
    expect(extractDecisions(parseSession(fixture("medium-multi-ask")))).toHaveLength(2);
    expect(extractDecisions(parseSession(fixture("session-review-design")))).toHaveLength(1);
  });

  it("treats an unmatched answer as a custom chosen option", () => {
    const model = makeModel([
      makeTurn({
        userText: "pick one",
        toolCalls: [
          makeCall({
            name: "AskUserQuestion",
            input: { questions: [{ question: "Which?", options: [{ label: "A" }, { label: "B" }] }] },
            resultText: 'User has answered your questions: "Which?"="Something else entirely".',
          }),
        ],
      }),
    ]);
    const [d] = extractDecisions(model);
    expect(d.options[0]).toEqual({ label: "Something else entirely", chosen: true });
    expect(d.options.filter((o) => o.chosen)).toHaveLength(1);
  });

  it("ignores a rejected (is_error) ask", () => {
    const model = makeModel([
      makeTurn({
        userText: "x",
        toolCalls: [
          makeCall({
            name: "AskUserQuestion",
            isError: true,
            input: { questions: [{ question: "Q", options: [{ label: "A" }] }] },
            resultText: "The user doesn't want to proceed with this tool use.",
          }),
        ],
      }),
    ]);
    expect(extractDecisions(model)).toHaveLength(0);
  });

  it("detects an approved ExitPlanMode as a user-approved decision", () => {
    const model = makeModel([
      makeTurn({
        userText: "go",
        toolCalls: [makeCall({ name: "ExitPlanMode", input: { plan: "# Ship the parser\nthen the view" } })],
      }),
      makeTurn({ userText: "looks good, proceed" }),
    ]);
    const [d] = extractDecisions(model);
    expect(d.kind).toBe("plan");
    expect(d.decider).toBe("user-approved");
    expect(d.heading).toMatch(/ship the parser/i);
  });
});

// --- friction -----------------------------------------------------------------
describe("extractFrictions", () => {
  it("tiny fixture yields one interruption correction", () => {
    const frictions = extractFrictions(parseSession(fixture("tiny-ask-interrupt")));
    expect(frictions).toHaveLength(1);
    expect(frictions[0].kind).toBe("interruption");
  });

  it("detects a countermand opener", () => {
    const model = makeModel([makeTurn({ userText: "Why did you push to github? I wanted to test first" })]);
    const [f] = extractFrictions(model);
    expect(f.kind).toBe("countermand");
    expect(f.type).toBe("correction");
  });

  it("does not flag a normal turn as a countermand", () => {
    const model = makeModel([makeTurn({ userText: "Please add a dark mode toggle to the header" })]);
    expect(extractFrictions(model)).toHaveLength(0);
  });

  it("flags edit churn only at the ≥4 threshold", () => {
    const three = makeModel([
      makeTurn({
        userText: "edit",
        toolCalls: [0, 1, 2].map(() => makeCall({ name: "Edit", filePaths: ["/x/app.ts"] })),
      }),
    ]);
    expect(extractFrictions(three)).toHaveLength(0);

    const four = makeModel([
      makeTurn({
        userText: "edit",
        toolCalls: [0, 1, 2, 3].map(() => makeCall({ name: "Edit", filePaths: ["/x/app.ts"] })),
      }),
    ]);
    const [f] = extractFrictions(four);
    expect(f.kind).toBe("churn");
    expect(f.title).toMatch(/app\.ts/);
  });

  it("interruption takes precedence over countermand on the same turn", () => {
    const model = makeModel([
      makeTurn({ userText: "[Request interrupted by user] no, stop", interrupted: true }),
    ]);
    const frictions = extractFrictions(model);
    expect(frictions).toHaveLength(1);
    expect(frictions[0].kind).toBe("interruption");
  });
});

// --- highlights: rank + cap ---------------------------------------------------
describe("selectHighlights — rank and cap", () => {
  function hl(over: Partial<Highlight> & { rank: number; at: Date }): Highlight {
    return {
      id: Math.random().toString(36),
      type: "decision",
      kind: "ask",
      turnIndex: 0,
      title: "",
      heading: "",
      options: [],
      why: "",
      resolution: "",
      criteria: [],
      decider: "user",
      evidence: [],
      ...over,
    };
  }

  it("caps at six, keeping highest priority", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));
    const candidates = [
      hl({ rank: 5, at: t(1) }), // churn — lowest priority
      hl({ rank: 1, at: t(2) }),
      hl({ rank: 1, at: t(3) }),
      hl({ rank: 3, at: t(4) }),
      hl({ rank: 3, at: t(5) }),
      hl({ rank: 3, at: t(6) }),
      hl({ rank: 1, at: t(7) }),
    ];
    const kept = selectHighlights(candidates);
    expect(kept).toHaveLength(6);
    // the lone churn (rank 5) should be the one dropped
    expect(kept.some((h) => h.rank === 5)).toBe(false);
  });

  it("returns kept highlights in chronological order", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));
    const kept = selectHighlights([
      hl({ rank: 1, at: t(30) }),
      hl({ rank: 3, at: t(10) }),
      hl({ rank: 1, at: t(20) }),
    ]);
    expect(kept.map((h) => h.at.getUTCMinutes())).toEqual([10, 20, 30]);
  });
});

// --- stats & headline ---------------------------------------------------------
describe("stats + headline + deck", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("under a minute");
    expect(formatDuration(42 * 60000)).toBe("42m");
    expect(formatDuration(84 * 60000)).toBe("1h 24m");
    expect(formatDuration(120 * 60000)).toBe("2h");
  });

  it("templates the headline with correct pluralization", () => {
    const d = analyze(parseSession(fixture("tiny-ask-interrupt")));
    expect(d.headline).toBe("1 decision, 1 correction in 36m");
  });

  it("deck is the first substantive human prompt, cleaned", () => {
    const d = analyze(parseSession(fixture("session-review-design")));
    expect(d.deck).not.toMatch(/|<command|local-command/);
    expect(d.deck.length).toBeGreaterThan(0);
  });

  it("handles an empty session without throwing", () => {
    const d = analyze(parseSession(""));
    expect(d.highlights).toHaveLength(0);
    expect(d.tape).toHaveLength(0);
    expect(d.stats.turnCount).toBe(0);
  });
});

// --- tape ---------------------------------------------------------------------
describe("buildTape", () => {
  it("emits one row per human turn with glyphs and clock labels", () => {
    const d = analyze(parseSession(fixture("session-review-design")));
    expect(d.tape).toHaveLength(23);
    expect(d.tape.filter((r) => r.hasDecision).length).toBeGreaterThanOrEqual(1);
    expect(d.tape.filter((r) => r.hasError).length).toBeGreaterThanOrEqual(1);
    expect(d.tape[0].timeLabel).toMatch(/^\d{2}:\d{2}$/);
  });

  it("collapses repeated same-file edits into a single ×N act", () => {
    const model = makeModel([
      makeTurn({
        userText: "polish",
        toolCalls: [0, 1, 2].map(() => makeCall({ name: "Edit", filePaths: ["/x/styles.css"] })),
      }),
    ]);
    const d = analyze(model);
    const editActs = d.tape[0].acts.filter((a) => a.tag === "edit");
    expect(editActs).toHaveLength(1);
    expect(editActs[0].text).toMatch(/×3/);
  });
});

// --- text utils ---------------------------------------------------------------
describe("text helpers", () => {
  it("cleanUserText strips ANSI, command wrappers, and interrupt markers", () => {
    expect(cleanUserText("Set model to [1mFable 5[22m done")).toBe("Set model to Fable 5 done");
    expect(cleanUserText("<command-name>/model</command-name>\nreal text")).toBe("real text");
    expect(cleanUserText("[Request interrupted by user] stop now")).toBe("stop now");
  });

  it("cleanUserText leaves literal bracketed text intact", () => {
    expect(cleanUserText("see item [3] and [foo]")).toBe("see item [3] and [foo]");
  });

  it("truncate breaks on a word boundary with an ellipsis", () => {
    expect(truncate("hello world foobar", 12)).toBe("hello world…");
    expect(truncate("short", 20)).toBe("short");
  });

  it("stripRecommended removes the annotation", () => {
    expect(stripRecommended("Native Swift / SwiftUI (Recommended)")).toBe("Native Swift / SwiftUI");
  });
});
