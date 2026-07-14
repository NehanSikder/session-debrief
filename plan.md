# Session Debrief — MVP1 Implementation Plan

A local web app that turns a Claude Code session (`.jsonl`) into a fast human-readable
debrief: what was decided, what went wrong, and where in the transcript each of those
moments lives. North star: **fast human understanding** — a reviewer should grasp the
session's key decisions in under a minute.

**Status:** design phase complete (2026-07-13). Research report + interactive prototype
approved by the user. This plan is the build spec for MVP1.

**Visual reference (authoritative):** `docs/prototype.html` — open it in a browser.
The final app must look and behave like this prototype. It contains fake data modeling
a real session; the job of MVP1 is to produce the same view from a real session file.
(Also published at https://claude.ai/code/artifact/bacb0722-c254-4b1c-bff9-85c1899136c9,
research report at https://claude.ai/code/artifact/a755bb8f-a718-4415-accd-cb78c58b45d8.)

---

## 1. Product decisions already made (do not relitigate)

- **Two entry points, one codebase.** MVP1 ships the standalone SPA with file upload.
  A Claude Code skill that opens the SPA pre-loaded with the current session is a
  fast-follow (§8) — which is why **the parser/analyzer must run 100% in-browser**
  (no server, no network calls; sessions are private data).
- **Hybrid analysis roadmap.** MVP1 is **fully deterministic** (no LLM). Phase 2 adds
  LLM enrichment as a plug-in "lens" (QOC rationale inference, interval summaries).
  Design module boundaries so the analyzer is swappable.
- **Core schema is QOC** (MacLean et al. 1991), constant across phases:

  ```ts
  type Decision = {
    question: string;          // what was being decided
    options: Option[];         // considered alternatives, chosen flagged
    criteria: string[];        // why (may be empty in deterministic mode)
    resolution: string;        // the chosen path, one sentence
    decider: "user" | "agent" | "user-approved";
    evidenceTurns: TurnRef[];  // links back to exact transcript turns
  };
  ```

- **Display = timeline master + detail card** (overview+detail, Cockburn 2009):
  interactive horizontal timeline on top, one detail card below that renders **only
  after** a mark is selected; ✕/Escape closes it and returns focus to the timeline.
  Full transcript ("the tape") collapsed at the bottom. Explicit dark-mode toggle.
- **Highlight cap ≈ 6** per session (Cowan 2001 working-memory span). More decisions
  than 6 → rank and show the top 6, rest reachable via the tape.
- **Audience is both** self-recall (session author) and cold readers.

## 2. Tech stack

- **TypeScript + Vite + Vitest.** No UI framework — the view is one SVG timeline plus
  templated DOM, vanilla is fine and keeps the skill entry point trivial (static files).
- No runtime dependencies unless genuinely needed. Parser and analyzer are pure
  functions over immutable data (per global coding rules).
- Output of `vite build` must be static files servable from anywhere (file://-friendly
  is a nice-to-have, not required for MVP1 — `npx vite preview` or `python3 -m http.server`
  is acceptable for local testing).

## 3. Architecture / module layout

```
session-review/
├── plan.md                    ← this file
├── docs/prototype.html        ← approved visual reference
├── index.html                 ← SPA shell + upload screen
├── src/
│   ├── parser/                # .jsonl → SessionModel (pure)
│   │   ├── parse.ts           # line-by-line JSONL → raw records, tolerant of unknowns
│   │   ├── turns.ts           # raw records → Turn[] (user/assistant pairing, tools)
│   │   └── types.ts           # SessionModel, Turn, ToolCall, TurnRef
│   ├── analyzer/              # SessionModel → Debrief (pure, swappable)
│   │   ├── decisions.ts       # deterministic decision extraction (§5)
│   │   ├── friction.ts        # corrections / interruptions / churn / errors (§5)
│   │   ├── highlights.ts      # rank + cap at 6, build Highlight[]
│   │   ├── stats.ts           # duration, turn count, counts for masthead
│   │   └── types.ts           # Debrief, Highlight, Decision, Friction
│   ├── view/                  # Debrief → DOM (matches prototype exactly)
│   │   ├── timeline.ts        # SVG timeline (axis, grid, turn ticks, marks, labels)
│   │   ├── card.ts            # detail card (render on select, ✕/Escape, ←/→ nav)
│   │   ├── tape.ts            # collapsed full-transcript rows with act sub-rows
│   │   ├── masthead.ts        # brand line, headline, stat line, theme toggle
│   │   └── theme.ts           # dark/light toggle, localStorage persistence
│   ├── app.ts                 # wiring: upload → parse → analyze → render
│   └── styles.css             # design tokens from prototype (§7)
├── tests/
│   ├── fixtures/              # real session .jsonl files (small, redacted)
│   └── ...                    # unit tests mirroring src/ layout
└── package.json
```

Data flow is one direction: `File → parse() → SessionModel → analyze() → Debrief → render()`.
Each stage is a pure function with its own tests. Never mutate a model in place.

## 4. Parser (src/parser)

Input: Claude Code session JSONL from `~/.claude/projects/<project-dir>/<session-id>.jsonl`.

**First step of implementation: grab 2–3 real session files from `~/.claude/projects/`
and inspect them before writing the parser.** Do not trust this plan's description of
the format over the actual files — the format is undocumented and versioned. Copy
small ones into `tests/fixtures/` (strip anything sensitive).

Known shape (verify against fixtures):
- One JSON object per line. `type` field: `"user"`, `"assistant"`, plus non-message
  records (`"summary"`, hooks, etc.) — skip unknown types gracefully, never throw.
- Message records carry `message` (role + content blocks: `text`, `tool_use`,
  `tool_result`), `timestamp` (ISO), `uuid` / `parentUuid`, `isSidechain` (subagent
  traffic — exclude from the main timeline).
- User lines that are tool results are not human turns. A **human turn** is a user
  record whose content is real text (including `[Request interrupted by user]` markers
  and command/skill invocations).

Output `SessionModel`:
```ts
type SessionModel = {
  sessionId: string;
  startedAt: Date; endedAt: Date;
  turns: Turn[];               // one per HUMAN user message (episode anchor)
};
type Turn = {
  index: number; at: Date;
  userText: string;
  interrupted: boolean;        // [Request interrupted...] marker present
  assistantSummaryText: string;   // first assistant text of the episode (for tape one-liner)
  toolCalls: ToolCall[];       // name, key input fields, error flag, file paths touched
};
```

Parser rules: validate at the boundary (bad line → warn + skip, count reported in UI);
never let one malformed line kill the render.

## 5. Analyzer (src/analyzer) — deterministic MVP1 rules

**Decisions** (type `decision`, blue square on timeline):
1. **AskUserQuestion turns** — the strongest signal. Question, options, and the user's
   selection are all in the tool call/result → a fully-populated QOC decision.
   `decider: "user"`.
2. **Plan approvals** — `ExitPlanMode` tool call followed by user approval →
   decision "adopted the plan", resolution = plan's first heading/sentence,
   `decider: "user-approved"`.
3. **Explicit user directives** — a human turn that begins with/contains a clear
   pick from offered options (detect: assistant turn listed options — e.g. a numbered/
   bulleted list in its text — and the next user turn names one). Keep this heuristic
   conservative; false positives are worse than misses. `decider: "user"`.

**Frictions** (type `correction`, red dot on timeline):
1. **Interruptions** — turn with `[Request interrupted by user]` marker.
2. **Countermands** — user turn matching patterns like "why did you…", "no, …",
   "that's not what…", "undo/revert…" (small conservative pattern list, easy to extend).
3. **Edit churn** — same file edited ≥4 times within one episode → friction annotation.
4. **Tool errors** — `tool_result` with `is_error` → annotation on that turn (✕ glyph
   in the tape; only promoted to a highlight if the episode also has a countermand).

**Highlights:** merge decisions + frictions, rank (AskUserQuestion > plan approval >
interruption/countermand > directive > churn), cap at 6, chronological order for display.
Every highlight carries `evidenceTurns` so the card's "the moment" section can quote
the exact user/agent text.

**Stats + headline:** duration, human-turn count, decision count, correction count.
MVP1 headline is templated (no LLM): `"{N} decisions, {M} corrections — {duration}"`,
with the session's first user message (truncated) as the deck line. Phase 2 replaces
this with an LLM-written verdict.

**Tape:** every human turn = one row (time, user text first line, derived one-liner
from `assistantSummaryText`, glyphs for decision/friction/error), expandable to act
rows (tool name tag + short description, `err` tag styling for failures).

## 6. View (src/view) — match `docs/prototype.html`

Reproduce the prototype's behavior with real data. The prototype's HTML/CSS/JS is the
spec; lift its CSS wholesale into `styles.css`. Key contracts:

- **Timeline:** time axis with round-interval grid (choose tick step from session
  duration: 5/15/30/60 min), faint tick per human turn, labeled marks for highlights.
  Labels alternate above/below the axis; with real data, prevent label collisions —
  simple greedy layout: alternate sides, then nudge/stack stem heights (three height
  slots per side, as in the prototype). If the container is narrow, the timeline
  scrolls horizontally (`min-width` on the SVG).
- **Detail card:** hidden on load. Click/Enter on a mark → card renders below with
  meta line (`n / total · type · time`), title, Options (✓ chosen / struck rejected),
  Why, and "The moment" (quoted evidence turns). ←/→ buttons + arrow keys navigate;
  ✕ button + Escape close and return focus to the last-selected mark.
- **Tape:** `<details>` rows as in the prototype.
- **Theme:** tokens on `:root`, `@media (prefers-color-scheme: dark)` defaults,
  `:root[data-theme=…]` overrides, masthead toggle persisted to localStorage.
- **Accessibility (non-negotiable):** all interactive marks keyboard-reachable with
  visible focus; type is never encoded by color alone (shape + word always present);
  `prefers-reduced-motion` respected (only motions: card fade, smooth scroll).

## 7. Design tokens (validated — do not eyeball new colors)

| Token | Light | Dark |
|---|---|---|
| ground | `#fcfcfb` | `#131417` |
| ink | `#111114` | `#f0efec` |
| secondary | `#5c5d63` | `#b0b0ac` |
| muted | `#97989d` | `#7b7c82` |
| hairline | `#e6e6e3` | `#2a2b30` |
| accent (decision) | `#2a78d6` | `#3987e5` |
| correction | `#d03b3b` | `#e05252` |
| link | `#1c5cab` | `#6da7ec` |
| code-bg | `#f0f0ee` | `#222327` |

Type: `"Helvetica Neue", -apple-system, system-ui` for UI/headings; `"SF Mono",
ui-monospace, Menlo` for timestamps, meta labels, tags. Blue/red marks are CVD-validated
as a pair on both surfaces; shape (■ vs ●) + text label are the required secondary encoding.

## 8. Upload flow + fast-follow

MVP1 upload screen: drag-and-drop or file-pick a `.jsonl`; parse in-browser; render
debrief. Show parse warnings count unobtrusively. A "load sample" button using a
bundled fixture so the app demos without a file.

Fast-follow (not MVP1, but don't paint it out): a Claude Code skill that copies the
current session's `.jsonl` next to the built app and opens the browser — this is why
everything stays client-side and static.

## 9. Testing (per global rules: TDD, 80%+ coverage)

Write tests first for parser and analyzer — they're pure functions and the heart of
the product:
- **parser:** real-fixture tests (turn count, timestamps, tool calls, interruption
  flags, sidechain exclusion, malformed-line tolerance).
- **analyzer:** fixture-driven — AskUserQuestion → full QOC decision; interruption →
  correction; churn threshold; highlight cap + ranking; stats.
- **view:** DOM tests where cheap (card open/close/focus-return, keyboard nav, theme
  toggle). Visual fidelity is checked against `docs/prototype.html` by eye.

Definition of done for MVP1: `npm test` green with ≥80% coverage on parser+analyzer;
upload a real session from `~/.claude/projects/` and get a debrief that matches the
prototype's look and interaction contract in both themes.

## 10. Milestones

1. Scaffold (Vite+TS+Vitest) + collect fixtures from real sessions.
2. Parser with tests (RED → GREEN per fixture).
3. Analyzer with tests.
4. View: masthead + timeline + card + tape + theme (against a fixture Debrief).
5. Upload wiring + sample session + parse-warning surface.
6. Manual end-to-end pass on 2–3 real sessions; fix label collisions and edge cases
   (very short sessions, sessions with 0 decisions — show tape-only with a note).
