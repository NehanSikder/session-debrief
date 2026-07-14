import type { Debrief, TapeAct, TapeRow } from "../analyzer/types";
import { el } from "./dom";

const CODE_TAGS = new Set(["edit", "write", "read", "cmd", "web"]);

function glyphs(row: TapeRow): HTMLElement {
  const spans: Node[] = [];
  if (row.hasDecision) spans.push(el("span", { class: "d" }, ["■"]));
  if (row.hasCorrection) spans.push(el("span", { class: "f" }, ["●"]));
  if (row.hasError) spans.push(el("span", { class: "f" }, [" ✕"]));
  return el("span", { class: "g" }, spans);
}

function actRow(act: TapeAct): HTMLElement {
  const body =
    act.text && CODE_TAGS.has(act.tag)
      ? el("code", {}, [act.text])
      : document.createTextNode(act.text || "-");
  return el("div", { class: "act" }, [
    el("span", { class: `tag${act.isError ? " err" : ""}` }, [act.isError ? "err" : act.tag]),
    el("span", {}, [body]),
  ]);
}

function tapeRow(row: TapeRow): HTMLElement {
  const summary = el("summary", {}, [
    el("span", { class: "t" }, [row.timeLabel]),
    el("span", { class: "msg" }, [row.userLine, el("span", { class: "one" }, [row.oneLiner])]),
    glyphs(row),
  ]);
  const detail = el(
    "div",
    { class: "tdetail" },
    row.acts.length ? row.acts.map(actRow) : [el("div", { class: "act" }, [el("span", {}, ["(no tool activity)"])])],
  );
  return el("details", { class: "trow" }, [summary, detail]);
}

/** The tape: the full session, turn by turn (plan §6). */
export function renderTape(debrief: Debrief): HTMLElement {
  const summary = el("summary", {}, [
    el("span", { class: "tape-title" }, ["The tape"]),
    el("span", { class: "tape-sub" }, [`the full session, turn by turn · ${debrief.tape.length} turns`]),
    el("span", { class: "tape-dis" }, ["unroll →"]),
  ]);
  return el("details", { class: "tape" }, [
    summary,
    el("div", { class: "turns" }, debrief.tape.map(tapeRow)),
  ]);
}
