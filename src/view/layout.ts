import type { Debrief, Highlight } from "../analyzer/types";
import { formatClock } from "../analyzer/time";

// SVG geometry (mirrors docs/prototype.html viewBox 0 0 940 300).
const MARGIN_L = 40;
const MARGIN_R = 30;
const TICK_SPACING = 145; // px between round-time grid ticks
const AXIS_Y = 180;
const GRID_TOP = 60;
const GRID_BOTTOM = 196;
const MARK_TOP = 175;
const MIN_LABEL_GAP = 120; // same-side labels closer than this get a new tier
const TIER_STEP = 30;
const MAX_TIER = 2;

export interface GridLine {
  x: number;
  label: string;
}

export interface MarkLayout {
  highlight: Highlight;
  index: number;
  x: number;
  side: "above" | "below";
  timeY: number;
  titleY: number;
  stemY1: number;
  stemY2: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  axisY: number;
  gridTop: number;
  gridBottom: number;
  markTop: number;
  plotLeft: number;
  plotRight: number;
  labelY: number;
  grid: GridLine[];
  turnX: number[];
  spanX1: number;
  spanX2: number;
  marks: MarkLayout[];
}

/** Round-interval grid step in minutes, from session duration (plan §6). */
export function chooseStepMinutes(durationMs: number): number {
  const min = durationMs / 60000;
  if (min <= 30) return 5;
  if (min <= 90) return 15;
  if (min <= 180) return 30;
  return 60;
}

function floorTo(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}
function ceilTo(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

/** Compute the full timeline layout for a Debrief. Pure — no DOM. */
export function computeTimeline(debrief: Debrief, turnTimes: number[]): TimelineLayout {
  const startMs = debrief.stats.startedAt.getTime();
  const endMs = debrief.stats.endedAt.getTime();
  const stepMin = chooseStepMinutes(debrief.stats.durationMs);
  const stepMs = stepMin * 60000;

  let axisStart = floorTo(startMs, stepMs);
  let axisEnd = ceilTo(endMs, stepMs);
  if (axisEnd <= axisStart) axisEnd = axisStart + stepMs;

  const gridCount = Math.round((axisEnd - axisStart) / stepMs) + 1;
  const plotW = Math.max(1, gridCount - 1) * TICK_SPACING;
  const plotLeft = MARGIN_L;
  const plotRight = plotLeft + plotW;
  const width = plotRight + MARGIN_R;

  const span = axisEnd - axisStart;
  const x = (ms: number): number => {
    const t = (ms - axisStart) / span;
    const clamped = Math.min(1, Math.max(0, t));
    return plotLeft + clamped * plotW;
  };

  const grid: GridLine[] = [];
  for (let i = 0; i < gridCount; i++) {
    const ms = axisStart + i * stepMs;
    grid.push({ x: x(ms), label: formatClock(new Date(ms)) });
  }

  const turnX = turnTimes.map(x);
  const spanX1 = turnX.length ? Math.min(...turnX) : plotLeft;
  const spanX2 = turnX.length ? Math.max(...turnX) : plotRight;

  // Marks: alternate above/below; bump to a higher tier when a same-side
  // neighbor is too close (greedy collision avoidance, plan §6).
  const lastX = { above: -Infinity, below: -Infinity };
  const lastTier = { above: 0, below: 0 };
  let maxBelowTitleY = 0;
  let minAboveTitleY = AXIS_Y;

  const marks: MarkLayout[] = debrief.highlights.map((highlight, index) => {
    const side: "above" | "below" = index % 2 === 0 ? "above" : "below";
    const mx = x(highlight.at.getTime());
    let tier = 0;
    if (mx - lastX[side] < MIN_LABEL_GAP) tier = Math.min(MAX_TIER, lastTier[side] + 1);
    lastX[side] = mx;
    lastTier[side] = tier;

    let titleY: number;
    let stemY1: number;
    let stemY2: number;
    if (side === "above") {
      titleY = 86 - tier * TIER_STEP;
      stemY1 = titleY + 6;
      stemY2 = MARK_TOP - 1;
      minAboveTitleY = Math.min(minAboveTitleY, titleY);
    } else {
      titleY = 274 + tier * TIER_STEP;
      stemY1 = MARK_TOP + 11;
      stemY2 = titleY - 34;
      maxBelowTitleY = Math.max(maxBelowTitleY, titleY);
    }
    return { highlight, index, x: mx, side, timeY: titleY - 16, titleY, stemY1, stemY2 };
  });

  const height = Math.max(300, maxBelowTitleY + 20);

  return {
    width,
    height,
    axisY: AXIS_Y,
    gridTop: GRID_TOP,
    gridBottom: GRID_BOTTOM,
    markTop: MARK_TOP,
    plotLeft,
    plotRight,
    labelY: 212,
    grid,
    turnX,
    spanX1,
    spanX2,
    marks,
  };
}
