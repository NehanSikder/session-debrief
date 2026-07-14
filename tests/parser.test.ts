import { describe, it, expect } from "vitest";
import { parseJsonl, buildSession, parseSession } from "../src/parser";
import { fixture } from "./helpers";

describe("parseJsonl — tolerant line reader", () => {
  it("skips malformed lines and counts them as warnings", () => {
    const text = [
      '{"type":"user","message":{"role":"user","content":"hi"}}',
      "not json at all",
      "",
      '{"type":"assistant","message":{"role":"assistant","content":"ok"}}',
      "{ also broken",
    ].join("\n");
    const { records, warnings } = parseJsonl(text);
    expect(records).toHaveLength(2);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/line 2/i);
  });

  it("rejects non-object JSON lines", () => {
    const { records, warnings } = parseJsonl('[1,2,3]\n42\n"a string"');
    expect(records).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });

  it("never throws on empty input", () => {
    expect(() => parseJsonl("")).not.toThrow();
    expect(parseJsonl("").records).toHaveLength(0);
  });
});

describe("buildSession — tiny fixture (ground truth)", () => {
  const model = parseSession(fixture("tiny-ask-interrupt"));

  it("extracts exactly 3 human turns", () => {
    expect(model.turns).toHaveLength(3);
    model.turns.forEach((t, i) => expect(t.index).toBe(i));
  });

  it("derives session start and end from timestamps", () => {
    expect(model.startedAt.toISOString()).toBe("2026-06-14T15:40:41.968Z");
    expect(model.endedAt.toISOString()).toBe("2026-06-14T16:16:13.674Z");
  });

  it("flags the interrupted turn and only that turn", () => {
    const interrupted = model.turns.filter((t) => t.interrupted);
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].index).toBe(1);
    expect(interrupted[0].userText).toMatch(/interrupted by user/i);
  });

  it("collects all 8 tool calls across episodes", () => {
    const calls = model.turns.flatMap((t) => t.toolCalls);
    expect(calls).toHaveLength(8);
    const names = calls.map((c) => c.name).sort();
    expect(names).toEqual(
      ["AskUserQuestion", "AskUserQuestion", "ToolSearch", "WebFetch", "WebFetch", "WebSearch", "WebSearch", "WebSearch"].sort(),
    );
  });

  it("marks the one tool error", () => {
    const errors = model.turns.flatMap((t) => t.toolCalls).filter((c) => c.isError);
    expect(errors).toHaveLength(1);
  });

  it("captures AskUserQuestion input and answer on the tool call", () => {
    const ask = model.turns
      .flatMap((t) => t.toolCalls)
      .find((c) => c.name === "AskUserQuestion");
    expect(ask).toBeDefined();
    expect(ask!.input).toHaveProperty("questions");
    expect(ask!.resultText).toMatch(/answered/i);
  });

  it("gives each turn a first-assistant-text summary line", () => {
    // the first episode ends with the agent responding before the interruption
    expect(model.turns[0].assistantSummaryText.length).toBeGreaterThan(0);
  });
});

describe("buildSession — turn counts across fixtures", () => {
  it("medium fixture has 20 human turns", () => {
    expect(parseSession(fixture("medium-multi-ask")).turns).toHaveLength(20);
  });

  it("design fixture has 23 human turns", () => {
    expect(parseSession(fixture("session-review-design")).turns).toHaveLength(23);
  });

  it("excludes sidechain and isMeta records from turns", () => {
    const text = [
      '{"type":"user","isMeta":true,"message":{"role":"user","content":"injected system context"}}',
      '{"type":"user","isSidechain":true,"message":{"role":"user","content":"subagent prompt"}}',
      '{"type":"user","message":{"role":"user","content":"real human turn"}}',
      '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"result only, not human"}]}}',
    ].join("\n");
    const model = buildSession(parseJsonl(text));
    expect(model.turns).toHaveLength(1);
    expect(model.turns[0].userText).toBe("real human turn");
  });

  it("propagates parse warnings into the model", () => {
    const model = buildSession(parseJsonl("broken line\n" + '{"type":"user","message":{"role":"user","content":"hi"}}'));
    expect(model.warnings).toHaveLength(1);
  });
});
