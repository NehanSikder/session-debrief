---
name: review-debrief
description: Open the Session Debrief timeline for a Claude Code session. Invoked mid-session, it loads the current session; invoked fresh, it opens an interactive CLI picker over all local sessions. Opens the hosted app with the session in the URL fragment — no upload, no local server.
---

# Review a session in the Session Debrief timeline

Opens the hosted Session Debrief app with a session `.jsonl` handed off in the
URL fragment (`#s=<gzip+base64url>`). URL fragments are never sent to a server,
so the session data stays between this skill and the browser. Two modes, chosen
by intent:

- **Current session** (default) — the user invokes this *during* a session and
  wants to review the conversation they're in right now.
- **Pick** — the user invokes this at the *start* of a session (or asks to
  "browse"/"choose"/"list" sessions) and wants to select one from all their
  local Claude Code sessions.

## How to run

The launcher is `launch.mjs`, installed next to this file in
`~/.claude/skills/review-debrief/`. It needs only Node — no repo, no build.

### Current session

Run it yourself — it resolves the current session, packs it, and opens the app:

```
node ~/.claude/skills/review-debrief/launch.mjs current
```

The current session is resolved from `$CLAUDE_CODE_SESSION_ID`. Report the app
URL it prints back to the user.

### Pick from all sessions (interactive)

The picker needs an interactive terminal, so **have the user run it**, not you.
Tell them to type this into the prompt (the `!` runs it in their shell):

```
! node ~/.claude/skills/review-debrief/launch.mjs pick
```

They navigate with ↑/↓, open with Enter, quit with `q`. After selection it opens
the app automatically.

## Notes

- The app URL defaults to the public GitHub Pages site; override it with
  `SESSION_DEBRIEF_URL` (e.g. to test against a local build).
- The session is gzipped and base64url-encoded into the fragment, then opened via
  a tiny local redirect page (so the long fragment isn't passed as a shell
  argument). Nothing is uploaded; the fragment stays client-side.
- Very large sessions produce a long link; the launcher warns past ~2 MB packed.
