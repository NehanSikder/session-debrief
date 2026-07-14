import type { EvidenceTurn, Highlight } from "../analyzer/types";
import { formatClock } from "../analyzer/time";
import { clear, el } from "./dom";

export interface CardView {
  element: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  close: HTMLButtonElement;
  render(highlight: Highlight, index: number, total: number): void;
}

function optionsList(highlight: Highlight): HTMLElement {
  return el(
    "ul",
    { class: "opts" },
    highlight.options.map((o) => el("li", o.chosen ? { class: "chosen" } : {}, [o.label])),
  );
}

function field(label: string, body: Node): HTMLElement {
  return el("div", {}, [el("p", { class: "fld-label" }, [label]), body]);
}

function evidenceTurn(turn: EvidenceTurn): HTMLElement {
  return el("div", { class: `turn ${turn.who}` }, [
    el("span", { class: "who" }, [turn.who]),
    el("p", {}, [turn.text]),
  ]);
}

function momentBlock(highlight: Highlight): HTMLElement {
  const label = `The moment · ${formatClock(highlight.at)}`;
  return el("div", { class: "moment" }, [
    el("p", { class: "fld-label" }, [label]),
    ...highlight.evidence.map(evidenceTurn),
  ]);
}

function decisionBody(highlight: Highlight): HTMLElement {
  return el("div", { class: "card-body" }, [
    field("Options", optionsList(highlight)),
    field("Why", el("p", { class: "why" }, [highlight.why])),
    momentBlock(highlight),
  ]);
}

function correctionBody(highlight: Highlight): HTMLElement {
  return el("div", { class: "card-body" }, [
    field("What happened", el("p", { class: "why" }, [highlight.why])),
    field("Takeaway", el("p", { class: "why" }, [highlight.resolution])),
    momentBlock(highlight),
  ]);
}

/** The detail card (the detail view). Hidden until a mark is selected (plan §6). */
export function createCard(): CardView {
  const meta = el("span", { class: "card-meta" });
  const prev = el("button", { id: "prev", "aria-label": "Previous highlight" }, ["←"]);
  const next = el("button", { id: "next", "aria-label": "Next highlight" }, ["→"]);
  const close = el("button", { id: "close", "aria-label": "Close detail, return to timeline" }, ["✕"]);
  const content = el("div", { id: "card-content" });

  const element = el("section", { class: "card", id: "card", "aria-live": "polite", hidden: true }, [
    el("div", { class: "card-top" }, [meta, el("span", { class: "card-nav" }, [prev, next, close])]),
    content,
  ]);

  function render(highlight: Highlight, index: number, total: number): void {
    const isCorrection = highlight.type === "correction";
    element.classList.toggle("corr", isCorrection);
    clear(meta);
    meta.append(
      `${index + 1} / ${total}  ·  `,
      el("span", { class: "type" }, [highlight.type]),
      `  ·  ${formatClock(highlight.at)}`,
    );

    const swap = el("div", { class: "card-swap" }, [
      el("h2", {}, [highlight.heading]),
      isCorrection ? correctionBody(highlight) : decisionBody(highlight),
    ]);
    clear(content);
    content.append(swap);
    element.hidden = false;
  }

  return { element, prev, next, close, render };
}
