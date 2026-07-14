import type { Debrief } from "../analyzer/types";
import { formatClock, formatDate } from "../analyzer/time";
import { el } from "./dom";

export interface Masthead {
  element: HTMLElement;
  themeButton: HTMLButtonElement;
}

/**
 * Header: brand, source/date meta, theme toggle, headline (the first human
 * prompt), and the mono stat line (plan §6). The templated counts headline
 * lives in the stat line; Phase 2 swaps in an LLM verdict as the h1.
 */
export function renderMasthead(debrief: Debrief, source?: string, onReset?: () => void): Masthead {
  const { stats } = debrief;

  const themeButton = el("button", { id: "theme", "aria-label": "Toggle dark mode" }, ["☾ dark"]);

  const backButton = onReset
    ? el("button", { id: "back", type: "button", "aria-label": "Start a new session" }, ["← New session"])
    : null;
  if (backButton && onReset) backButton.addEventListener("click", onReset);

  const range = `${formatDate(stats.startedAt)} · ${formatClock(stats.startedAt)}–${formatClock(stats.endedAt)}`;
  const metaChildren: (Node | string)[] = [range];
  if (source) metaChildren.push(el("b", {}, [` · ${source}`]));

  const decWord = stats.decisionCount === 1 ? "decision" : "decisions";
  const corrWord = stats.correctionCount === 1 ? "correction" : "corrections";
  const statline = el("p", { class: "statline" }, [
    `${stats.durationLabel}  ·  ${stats.turnCount} turns  ·  `,
    el("span", { class: "d" }, [`■ ${stats.decisionCount} ${decWord}`]),
    "  ·  ",
    el("span", { class: "f" }, [`● ${stats.correctionCount} ${corrWord}`]),
  ]);

  const headline = el("h1", { class: "deck" }, [debrief.deck]);
  fitHeadline(headline);

  const element = el("header", {}, [
    el("div", { class: "mast" }, [
      ...(backButton ? [backButton] : []),
      el("span", { class: "brand" }, ["Session Debrief"]),
      el("span", { class: "meta" }, metaChildren),
      themeButton,
    ]),
    headline,
    statline,
  ]);

  return { element, themeButton };
}

/**
 * Show the full opening prompt as the headline, shrinking the font until it fits
 * a few lines rather than truncating with an ellipsis. Measured after mount, so
 * it accounts for the actual column width; re-fits on viewport resize.
 */
function fitHeadline(h1: HTMLElement): void {
  if (typeof requestAnimationFrame !== "function") return;
  const TARGET_H = 190; // px — below this the responsive CSS size is left alone
  const MIN_PX = 14;
  const fit = (): void => {
    h1.style.fontSize = "";
    const base = parseFloat(getComputedStyle(h1).fontSize) || 30;
    let size = base;
    let guard = 60;
    while (size > MIN_PX && h1.scrollHeight > TARGET_H && guard-- > 0) {
      size = Math.max(MIN_PX, size - 1);
      h1.style.fontSize = `${size}px`;
    }
  };
  requestAnimationFrame(fit);
  if (typeof ResizeObserver === "function") {
    // Re-fit when the column width changes; observe the parent once mounted.
    requestAnimationFrame(() => {
      if (h1.parentElement) new ResizeObserver(fit).observe(h1.parentElement);
    });
  }
}
