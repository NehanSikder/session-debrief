import type { Debrief } from "../analyzer/types";
import { clear, el } from "./dom";
import { renderMasthead } from "./masthead";
import { renderTimeline } from "./timeline";
import { createCard } from "./card";
import { renderTape } from "./tape";
import { initTheme } from "./theme";

export interface RenderOptions {
  /** short source label (e.g. filename) shown in the masthead meta. */
  source?: string;
}

function legend(): HTMLElement {
  return el("p", { class: "tl-legend" }, [
    el("span", { class: "d" }, ["■"]),
    " decision   ",
    el("span", { class: "f" }, ["●"]),
    " correction   | faint tick = one turn. Select a highlight, or use ← →",
  ]);
}

function warningsBanner(count: number): HTMLElement {
  return el("p", { class: "warnings" }, [
    el("b", {}, [`${count} line${count === 1 ? "" : "s"} skipped`]),
    " while parsing (malformed or unrecognized). The rest of the session parsed normally.",
  ]);
}

function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A single document-level key handler; replaced (not stacked) on re-render.
let activeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

/** Render a full Debrief into `root`, wiring the master/detail interactions. */
export function renderDebrief(root: HTMLElement, debrief: Debrief, opts: RenderOptions = {}): void {
  clear(root);
  const wrap = el("div", { class: "wrap" });
  root.append(wrap);

  const mast = renderMasthead(debrief, opts.source);
  wrap.append(mast.element);
  initTheme(mast.themeButton);

  if (debrief.stats.warningCount > 0) wrap.append(warningsBanner(debrief.stats.warningCount));

  const total = debrief.highlights.length;

  if (total === 0) {
    wrap.append(
      el("p", { class: "empty-note" }, [
        "No decisions or corrections were detected in this session. The full transcript is below.",
      ]),
      renderTape(debrief),
    );
    return;
  }

  const turnTimes = debrief.tape.map((r) => r.at.getTime());
  const timeline = renderTimeline(debrief, turnTimes);
  const card = createCard();
  wrap.append(timeline.element, legend(), card.element, renderTape(debrief));

  let cur = 0;

  const setSelected = (i: number): void => {
    timeline.groups.forEach((g, k) => {
      g.classList.toggle("sel", k === i);
      g.setAttribute("aria-selected", String(k === i));
    });
  };

  const select = (i: number, scrollToCard = false): void => {
    cur = (i + total) % total;
    setSelected(cur);
    card.render(debrief.highlights[cur], cur, total);
    if (scrollToCard) {
      card.element.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    }
  };

  const closeCard = (): void => {
    card.element.hidden = true;
    timeline.groups.forEach((g) => {
      g.classList.remove("sel");
      g.setAttribute("aria-selected", "false");
    });
    timeline.groups[cur]?.focus();
  };

  timeline.groups.forEach((g, i) => {
    g.addEventListener("click", () => select(i, true));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(i, true);
      }
    });
  });
  card.prev.addEventListener("click", () => select(cur - 1));
  card.next.addEventListener("click", () => select(cur + 1));
  card.close.addEventListener("click", closeCard);

  if (activeKeyHandler) document.removeEventListener("keydown", activeKeyHandler);
  activeKeyHandler = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea")) return;
    if (e.key === "Escape" && !card.element.hidden) {
      closeCard();
      return;
    }
    if (e.key === "ArrowLeft") select(card.element.hidden ? cur : cur - 1);
    if (e.key === "ArrowRight") select(card.element.hidden ? cur : cur + 1);
  };
  document.addEventListener("keydown", activeKeyHandler);
}
