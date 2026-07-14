// Clock/date formatting shared by analyzer and view. Session timestamps are
// UTC (ISO "…Z"); we render them in the viewer's local timezone, 24-hour.

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "15:04" in local time. */
export function formatClock(d: Date): string {
  if (Number.isNaN(d.getTime())) return "--:--";
  return CLOCK.format(d).replace(/^24:/, "00:");
}

/** "Jul 11 2026" in local time. */
export function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "-";
  return DATE.format(d);
}
