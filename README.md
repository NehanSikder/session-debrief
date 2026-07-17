# Session Debrief

Turn a Claude Code session `.jsonl` file into a fast, human-readable debrief: the
decisions, the corrections, and where each one lives in the transcript. Built to
make a session understandable in under a minute.

Everything runs **entirely in your browser** — the parser and analyzer are pure
client-side TypeScript. No backend, no network calls, nothing is uploaded. Your
sessions stay on your machine.

## Use it

Open the app, then drag & drop a Claude Code session file (or pick one). Sessions
live in `~/.claude/projects/`.

- **Timeline** — an overview of every decision (squares) and correction (circles),
  scrollable and zoomable. Hover a mark for a summary; click it for the full detail.
- **The tape** — the full session, turn by turn.

## Review from Claude Code (skill)

The `review-debrief` skill launches the debrief straight from a Claude Code
session — no manual file picking. It gzips the chosen `.jsonl` into the **URL
fragment** (`#s=…`) of the hosted app and opens your browser. Fragments are never
sent to a server, so the session data stays between the skill and your browser —
nothing is uploaded, and no local server is needed.

**Install it once** — it lives globally in `~/.claude/skills/` so `/review-debrief`
works from **any** session, in any directory. It's self-contained (just Node — no
repo, no build, no `node_modules`):

```bash
git clone <this-repo> && cd session-debrief
./skill/install.sh   # copies SKILL.md + launch.mjs → ~/.claude/skills/review-debrief/
```

Then, from any Claude Code session:

- **`/review-debrief`** — render the session you're in right now.
- **`! node ~/.claude/skills/review-debrief/launch.mjs pick`** — interactive
  picker over all local sessions (↑/↓ to move, Enter to open, `q` to quit).
  Run it yourself with the leading `!` — the picker needs your terminal.

The launcher resolves the session, gzips + base64url-encodes it into the fragment,
and opens the hosted app via a tiny local redirect page (so the long fragment
isn't passed as a shell argument). Requires Node 18+. It points at the public
GitHub Pages site by default; override with `SESSION_DEBRIEF_URL` (e.g. a local
`npm run preview` build). Very large sessions produce a long link — the launcher
warns past ~2 MB packed.

The skill source lives in [`skill/`](skill/): just `SKILL.md` + `launch.mjs`.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build      # static bundle → dist/
npm run preview    # serve the production build
```

## Deploy

`npm run build` emits a static site to `dist/` (Vite `base: "./"`, so it works from
any path). The included GitHub Actions workflow (`.github/workflows/deploy.yml`)
builds and publishes to GitHub Pages on every push to `main`.

## Stack

TypeScript · Vite · Vitest · vanilla DOM (no framework, no runtime dependencies).
