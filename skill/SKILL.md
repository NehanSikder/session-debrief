---
name: review-debrief
description: Review the current Claude Code session in the Session Debrief timeline. Opens the hosted app and reveals the session's .jsonl in the file explorer; the user drags it onto the page to load it. Nothing is uploaded — the site parses the file in the browser.
---

# Review the current session in the Session Debrief timeline

Opens the hosted Session Debrief app and reveals the current session's `.jsonl`
in the file explorer. The user then drags that file onto the page (or picks it
via the file dialog) to load the debrief. The site parses everything in the
browser — the file is never uploaded, and this skill never reads or transmits it.

## How to run

The launcher is `launch.mjs`, installed next to this file in
`~/.claude/skills/review-debrief/`. It needs only Node — no repo, no build.

Run it yourself — it resolves the current session, opens the site in a browser
tab, and reveals the `.jsonl` in the file explorer:

```
node ~/.claude/skills/review-debrief/launch.mjs
```

Then relay its instructions to the user: **drag the highlighted `.jsonl` onto the
page** (or click "Choose a .jsonl file" and select it) to load the debrief.

The current session is resolved from `$CLAUDE_CODE_SESSION_ID`.

## Notes

- The app URL defaults to the public GitHub Pages site; override it with
  `SESSION_DEBRIEF_URL` (e.g. to test against a local `npm run preview` build).
- On macOS the file is revealed and highlighted in Finder (`open -R`); on Windows
  it's selected in Explorer; on Linux the containing folder is opened.
- The upload is manual by design: the browser's own file handling loads the
  session, so there are no size limits and nothing leaves the machine.
