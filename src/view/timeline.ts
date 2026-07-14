import type { Debrief, Highlight } from "../analyzer/types";
import { formatClock } from "../analyzer/time";
import { computeTimeline, type MarkLayout } from "./layout";
import { el, svg } from "./dom";

export interface TimelineView {
  /** the full timeline frame: toolbar + scroll viewport + tooltip. */
  element: HTMLElement;
  svgEl: SVGSVGElement;
  /** the interactive <g class="ev"> per highlight, index-aligned. */
  groups: SVGGElement[];
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function typeLabel(h: Highlight): string {
  return h.type === "decision" ? "Decision" : "Correction";
}

function timeText(mark: MarkLayout): string {
  const h = mark.highlight;
  return formatClock(h.at) + (h.endAt ? `–${formatClock(h.endAt)}` : "");
}

function markLabel(mark: MarkLayout): string {
  return `${timeText(mark)} ${mark.highlight.type}: ${mark.highlight.title}`;
}

function markShape(mark: MarkLayout): SVGElement {
  const cx = mark.x;
  const fill = mark.highlight.type === "decision" ? "var(--accent)" : "var(--correction)";
  if (mark.highlight.type === "decision") {
    return svg("rect", { class: "mk", x: cx - 5, y: 175, width: 10, height: 10, rx: 1.5, fill });
  }
  return svg("circle", { class: "mk", cx, cy: 180, r: 5.5, fill });
}

/** Build the timeline frame (master view) from a Debrief (plan §6). */
export function renderTimeline(debrief: Debrief, turnTimes: number[]): TimelineView {
  const layout = computeTimeline(debrief, turnTimes);

  const gridLines = layout.grid.map((g) =>
    svg("line", { class: "grid-tick", x1: g.x, y1: layout.gridTop, x2: g.x, y2: layout.gridBottom }),
  );
  const gridLabels = layout.grid.map((g) =>
    svg("text", { x: g.x, y: layout.labelY, "text-anchor": "middle" }, [g.label]),
  );

  const axis = svg("line", {
    class: "axis",
    x1: layout.plotLeft, y1: layout.axisY, x2: layout.plotRight, y2: layout.axisY,
  });
  const spanLine = svg("line", {
    class: "span",
    x1: layout.spanX1, y1: layout.axisY, x2: layout.spanX2, y2: layout.axisY,
  });

  const turnTicks = layout.turnX.map((tx) =>
    svg("line", { x1: tx, y1: 175, x2: tx, y2: 185 }),
  );

  const groups: SVGGElement[] = layout.marks.map((mark) =>
    svg(
      "g",
      {
        class: `ev${mark.highlight.type === "correction" ? " corr" : ""}`,
        "data-i": mark.index,
        role: "option",
        tabindex: 0,
        "aria-selected": false,
        "aria-label": markLabel(mark),
      },
      [
        svg("line", { class: "stem", x1: mark.x, y1: mark.stemY1, x2: mark.x, y2: mark.stemY2 }),
        svg("text", { class: "t-time", x: mark.x, y: mark.timeY, "text-anchor": "middle" }, [timeText(mark)]),
        svg("text", { class: "t-title", x: mark.x, y: mark.titleY, "text-anchor": "middle" }, [mark.highlight.title]),
        markShape(mark),
      ],
    ),
  );

  const svgEl = svg(
    "svg",
    {
      class: "tl",
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      preserveAspectRatio: "xMinYMin meet",
      role: "listbox",
      "aria-label": "Session timeline. Select a highlight to see detail below",
    },
    [
      svg("g", { class: "turns", "aria-hidden": "true" }, gridLines),
      ...gridLabels,
      axis,
      spanLine,
      svg("g", { class: "turns", "aria-hidden": "true" }, turnTicks),
      ...groups,
    ],
  );

  const scroll = el("div", { class: "tl-scroll" }, [svgEl]);
  const fadeL = el("div", { class: "tl-fade left", "aria-hidden": "true" }, [el("span", { class: "chev" }, ["‹"])]);
  const fadeR = el("div", { class: "tl-fade right", "aria-hidden": "true" }, [el("span", { class: "chev" }, ["›"])]);
  const viewport = el("div", { class: "tl-viewport" }, [scroll, fadeL, fadeR]);
  const tip = el("div", { class: "tl-tip", role: "tooltip", hidden: true });

  // Edge fades signal that events continue past the visible area; each side
  // shows only when there's more to scroll toward it.
  const updateFades = (): void => {
    const max = scroll.scrollWidth - scroll.clientWidth;
    fadeL.classList.toggle("show", scroll.scrollLeft > 2);
    fadeR.classList.toggle("show", scroll.scrollLeft < max - 2);
  };
  scroll.addEventListener("scroll", updateFades);

  // ---- zoom: render the SVG at real pixels and scroll, rather than squeezing
  // a long session into the container width (plan §6 readability). ----
  let zoom = 1;
  const applyZoom = (): void => {
    svgEl.style.width = `${Math.round(layout.width * zoom)}px`;
    svgEl.style.height = `${Math.round(layout.height * zoom)}px`;
    pct.textContent = `${Math.round(zoom * 100)}%`;
    updateFades();
  };
  const setZoom = (z: number): void => {
    zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    applyZoom();
  };

  const zoomBtn = (label: string, aria: string, onClick: () => void): HTMLButtonElement => {
    const b = el("button", { class: "tl-zoom-btn", type: "button", "aria-label": aria }, [label]);
    b.addEventListener("click", onClick);
    return b;
  };
  const pct = el("span", { class: "tl-zoom-pct", "aria-hidden": "true" }, ["100%"]);
  const out = zoomBtn("−", "Zoom out", () => setZoom(zoom - ZOOM_STEP));
  const zin = zoomBtn("+", "Zoom in", () => setZoom(zoom + ZOOM_STEP));
  const fit = zoomBtn("Fit", "Fit timeline to width", () => {
    const cw = scroll.clientWidth;
    if (cw) setZoom(cw / layout.width);
  });
  const tools = el("div", { class: "tl-tools", role: "toolbar", "aria-label": "Timeline zoom" }, [
    out, pct, zin, fit,
  ]);

  applyZoom();

  const frame = el("div", { class: "tl-frame" }, [tools, viewport, tip]);

  // ---- hover/focus tooltip: partial info, prompts a click for the full card ----
  const showTip = (mark: MarkLayout, anchor: SVGElement): void => {
    const h = mark.highlight;
    tip.replaceChildren(
      el("div", { class: "tt-head" }, [`${timeText(mark)} · ${typeLabel(h)}`]),
      el("div", { class: "tt-title" }, [h.title]),
      el("div", { class: "tt-sub" }, [truncate(h.heading || h.why || "", 110)]),
      el("div", { class: "tt-foot" }, ["Click on the event to get more information"]),
    );
    tip.hidden = false;
    const frameRect = frame.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const left = clamp(
      r.left + r.width / 2 - frameRect.left,
      70,
      Math.max(70, frameRect.width - 70),
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${r.top - frameRect.top}px`;
    // flip below the axis if there isn't room above
    tip.classList.toggle("below", r.top - frameRect.top < tip.offsetHeight + 16);
  };
  const hideTip = (): void => {
    tip.hidden = true;
  };

  layout.marks.forEach((mark, i) => {
    const g = groups[i];
    const anchor = g.querySelector<SVGElement>(".mk") ?? g;
    g.addEventListener("mouseenter", () => showTip(mark, anchor));
    g.addEventListener("mouseleave", hideTip);
    g.addEventListener("focus", () => showTip(mark, anchor));
    g.addEventListener("blur", hideTip);
  });

  // Fill the container when the timeline is narrower than it; otherwise keep it
  // at a readable density and let it scroll. Measured after mount.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      const cw = scroll.clientWidth;
      if (cw) setZoom(clamp(cw / layout.width, 1, 2));
      updateFades();
    });
  }
  // Recompute fades once mounted and whenever the viewport is resized.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(updateFades).observe(scroll);
  }

  return { element: frame, svgEl, groups };
}
