# Test fixtures

Real Claude Code session `.jsonl` files, redacted for use as test fixtures.
Redaction (see `scripts` history): home path → `/Users/user`, username → `user`,
emails → `user@example.com`, high-entropy secrets → `REDACTED_SECRET`, and any
single string longer than 600 chars truncated. All structure the parser and
analyzer read (record types, roles, content blocks, tool names/inputs,
timestamps, `is_error`, interruption markers, AskUserQuestion Q/A) is preserved.

| File | Records | Signal profile |
|---|---|---|
| `tiny-ask-interrupt.jsonl` | 58 | Smallest complete session — AskUserQuestion, an interruption, a tool error. Used for exact-count assertions. |
| `medium-multi-ask.jsonl` | 300 | Mid-size — 3 AskUserQuestion decisions, 3 interruptions. |
| `session-review-design.jsonl` | 623 | The session that designed this very tool — a realistic demo/sample. |
