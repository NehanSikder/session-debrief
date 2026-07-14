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
export function renderMasthead(debrief: Debrief, source?: string): Masthead {
  const { stats } = debrief;

  const themeButton = el("button", { id: "theme", "aria-label": "Toggle dark mode" }, ["☾ dark"]);

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

  const element = el("header", {}, [
    el("div", { class: "mast" }, [
      el("span", { class: "brand" }, ["Session Debrief"]),
      el("span", { class: "meta" }, metaChildren),
      themeButton,
    ]),
    el("h1", {}, [debrief.deck]),
    statline,
  ]);

  return { element, themeButton };
}
