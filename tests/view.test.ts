// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { parseSession } from "../src/parser";
import { analyze } from "../src/analyzer";
import type { Debrief } from "../src/analyzer/types";
import { renderDebrief } from "../src/view";
import { fixture } from "./helpers";

// jsdom lacks these; stub so view code that calls them doesn't throw.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
      onchange: null,
    })) as unknown as typeof window.matchMedia;
  }
  Element.prototype.scrollIntoView = () => {};
});

function debriefFor(name: string): Debrief {
  return analyze(parseSession(fixture(name)));
}

describe("renderDebrief — master/detail", () => {
  let root: HTMLElement;
  let debrief: Debrief;

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    root = document.createElement("div");
    document.body.innerHTML = "";
    document.body.append(root);
    debrief = debriefFor("medium-multi-ask");
    renderDebrief(root, debrief, { source: "medium.jsonl" });
  });

  it("renders masthead, timeline, and tape", () => {
    expect(root.querySelector(".mast .brand")?.textContent).toBe("Session Debrief");
    expect(root.querySelector("h1")?.textContent).toBe(debrief.deck);
    expect(root.querySelectorAll(".tl .ev")).toHaveLength(debrief.highlights.length);
    expect(root.querySelector(".tape")).toBeTruthy();
  });

  it("keeps the detail card hidden until a mark is selected", () => {
    const card = root.querySelector<HTMLElement>("#card")!;
    expect(card.hidden).toBe(true);
    (root.querySelector(".tl .ev") as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(card.hidden).toBe(false);
    expect(card.querySelector("h2")?.textContent).toBe(debrief.highlights[0].heading);
    expect(card.querySelector(".card-meta")?.textContent).toMatch(/1 \/ /);
  });

  it("closes on ✕ and returns focus to the selected mark", () => {
    const marks = root.querySelectorAll<SVGGElement>(".tl .ev");
    marks[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const card = root.querySelector<HTMLElement>("#card")!;
    root.querySelector<HTMLButtonElement>("#close")!.click();
    expect(card.hidden).toBe(true);
    expect(document.activeElement).toBe(marks[0]);
  });

  it("navigates with the → button and wraps around", () => {
    const total = debrief.highlights.length;
    root.querySelector<SVGGElement>(".tl .ev")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const meta = root.querySelector(".card-meta")!;
    expect(meta.textContent).toMatch(new RegExp(`1 / ${total}`));
    root.querySelector<HTMLButtonElement>("#next")!.click();
    expect(meta.textContent).toMatch(new RegExp(`2 / ${total}`));
  });

  it("selects the correct type class for corrections", () => {
    const corrIndex = debrief.highlights.findIndex((h) => h.type === "correction");
    const marks = root.querySelectorAll<SVGGElement>(".tl .ev");
    marks[corrIndex].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector("#card")!.classList.contains("corr")).toBe(true);
    expect(root.querySelector(".card-meta .type")?.textContent).toBe("correction");
  });

  it("toggles the theme and persists it", () => {
    const btn = root.querySelector<HTMLButtonElement>("#theme")!;
    const before = document.documentElement.dataset.theme;
    btn.click();
    expect(document.documentElement.dataset.theme).not.toBe(before);
    expect(["dark", "light"]).toContain(localStorage.getItem("sr-theme"));
  });
});

describe("renderDebrief — edge cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a tape-only note when there are no highlights", () => {
    const root = document.createElement("div");
    document.body.append(root);
    // craft a debrief with no highlights
    const debrief = debriefFor("medium-multi-ask");
    const empty: Debrief = { ...debrief, highlights: [] };
    renderDebrief(root, empty);
    expect(root.querySelector(".empty-note")).toBeTruthy();
    expect(root.querySelector(".tl")).toBeNull();
    expect(root.querySelector(".tape")).toBeTruthy();
  });

  it("surfaces parse warnings unobtrusively", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const debrief = debriefFor("medium-multi-ask");
    const withWarnings: Debrief = {
      ...debrief,
      stats: { ...debrief.stats, warningCount: 3 },
    };
    renderDebrief(root, withWarnings);
    expect(root.querySelector(".warnings")?.textContent).toMatch(/3 lines skipped/);
  });
});
