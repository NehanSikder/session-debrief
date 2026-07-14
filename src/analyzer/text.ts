// Small pure text helpers shared across analyzer modules.

const COMMAND_BLOCK_RE = /<[a-z-]*command[a-z-]*>[\s\S]*?<\/[a-z-]*command[a-z-]*>/g;
const CARET_TAG_RE = /<\/?[a-z-]+>/g;
const INTERRUPT_MARKER_RE = /\[Request interrupted by user[^\]]*\]/gi;
// ANSI/CSI escape sequences (e.g. from slash-command stdout). ESC-prefixed so
// literal text like "[Request…]" is never touched.
const ANSI_RE = new RegExp("\\u001b\\[[0-9;]*[A-Za-z]", "g");

/** Collapse whitespace to single spaces and trim. */
export function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** First non-empty line of a block of text. */
export function firstLine(s: string): string {
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/** Human-readable version of a raw user turn: strip command wrappers, ANSI, tags. */
export function cleanUserText(s: string): string {
  const stripped = s
    .replace(ANSI_RE, "")
    .replace(COMMAND_BLOCK_RE, " ")
    .replace(INTERRUPT_MARKER_RE, " ")
    .replace(CARET_TAG_RE, " ");
  const out = tidy(stripped);
  return out || tidy(s.replace(ANSI_RE, "").replace(CARET_TAG_RE, " "));
}

/** Truncate on a word boundary, adding an ellipsis when cut. */
export function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/** Strip a trailing "(Recommended)" annotation from an option label. */
export function stripRecommended(label: string): string {
  return label.replace(/\s*\(recommended\)\s*$/i, "").trim();
}
