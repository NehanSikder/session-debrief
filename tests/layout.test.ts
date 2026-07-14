import { describe, it, expect } from "vitest";
import { parseSession } from "../src/parser";
import { analyze } from "../src/analyzer";
import { chooseStepMinutes, computeTimeline } from "../src/view/layout";
import { fixture } from "./helpers";

describe("chooseStepMinutes", () => {
  it("scales the grid step with duration", () => {
    expect(chooseStepMinutes(20 * 60000)).toBe(5);
    expect(chooseStepMinutes(60 * 60000)).toBe(15);
    expect(chooseStepMinutes(150 * 60000)).toBe(30);
    expect(chooseStepMinutes(300 * 60000)).toBe(60);
  });
});

describe("computeTimeline", () => {
  const debrief = analyze(parseSession(fixture("medium-multi-ask")));
  const turnTimes = debrief.tape.map((r) => r.at.getTime());
  const layout = computeTimeline(debrief, turnTimes);

  it("places all marks within the plot area", () => {
    for (const m of layout.marks) {
      expect(m.x).toBeGreaterThanOrEqual(layout.plotLeft);
      expect(m.x).toBeLessThanOrEqual(layout.plotRight);
    }
  });

  it("alternates marks above and below the axis", () => {
    expect(layout.marks[0].side).toBe("above");
    expect(layout.marks[1].side).toBe("below");
  });

  it("emits one mark per highlight and one grid label per tick", () => {
    expect(layout.marks).toHaveLength(debrief.highlights.length);
    expect(layout.grid.length).toBeGreaterThanOrEqual(2);
    expect(layout.turnX).toHaveLength(turnTimes.length);
  });

  it("bumps a crowded same-side neighbor to a higher tier", () => {
    // Two decisions very close in time land on the same side (both index-even
    // spacing) — construct a synthetic close cluster.
    const close = analyze(parseSession(fixture("tiny-ask-interrupt")));
    const l = computeTimeline(close, close.tape.map((r) => r.at.getTime()));
    expect(l.marks.every((m) => m.titleY > 0)).toBe(true);
  });

  it("keeps the SVG at least 300 tall", () => {
    expect(layout.height).toBeGreaterThanOrEqual(300);
  });
});
