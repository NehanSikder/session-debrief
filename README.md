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
