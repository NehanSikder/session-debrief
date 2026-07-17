#!/usr/bin/env node
// Session Debrief launcher. Resolves a Claude Code session .jsonl and opens it
// in the hosted app, with the session handed off in the URL fragment
// (#s=<gzip+base64url>). Fragments are never sent to a server, so the data stays
// between this script and your browser — no upload, no local server, no repo.
//
//   node launch.mjs current   -> the session you're in now ($CLAUDE_CODE_SESSION_ID)
//   node launch.mjs pick       -> interactive picker over all local sessions

import { spawn } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { emitKeypressEvents } from "node:readline";

const PROJECTS = join(homedir(), ".claude", "projects");
const HOSTED = (process.env.SESSION_DEBRIEF_URL || "https://nehansikder.github.io/session-debrief/").replace(/#.*$/, "");
// Browsers handle large fragments, but flag genuinely huge sessions.
const WARN_BYTES = 2_000_000;

const mode = process.argv[2] ?? "current";

async function main() {
  const session = mode === "pick" ? await pickSession() : resolveCurrent();
  if (!session) process.exit(1);

  const raw = await readFile(session.file);
  const packed = gzipSync(raw).toString("base64url");
  if (packed.length > WARN_BYTES) {
    console.error(`  note: this session is large (${Math.round(packed.length / 1000)} KB packed) — the link may be slow to open.`);
  }

  const url = `${HOSTED}#s=${packed}&n=${encodeURIComponent(session.label)}`;
  await openUrl(url);

  console.log(`\n  ▸ ${session.label}`);
  console.log(`  ▸ opened ${HOSTED}`);
  console.log(`  ▸ ${Math.round(raw.length / 1000)} KB session · ${Math.round(packed.length / 1000)} KB in the link\n`);
}

// ---- session resolution ---------------------------------------------------

function resolveCurrent() {
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) {
    console.error("No CLAUDE_CODE_SESSION_ID in the environment — run `pick` instead.");
    return null;
  }
  const file = findSessionFile(sid);
  if (!file) {
    console.error(`Couldn't find a .jsonl for session ${sid} under ${PROJECTS}.`);
    return null;
  }
  return { file, label: `${projectLabel(dirname(file))} · ${sid.slice(0, 8)}` };
}

function findSessionFile(sid) {
  if (!existsSync(PROJECTS)) return null;
  for (const proj of readdirSyncSafe(PROJECTS)) {
    const candidate = join(PROJECTS, proj, `${sid}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function listSessions() {
  const rows = [];
  for (const proj of readdirSyncSafe(PROJECTS)) {
    const dir = join(PROJECTS, proj);
    let files;
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const file = join(dir, f);
      let st;
      try {
        st = await stat(file);
      } catch {
        continue;
      }
      rows.push({
        file,
        project: projectLabel(dir),
        prompt: await firstPrompt(file),
        mtime: st.mtimeMs,
        kb: Math.max(1, Math.round(st.size / 1024)),
        id: basename(f, ".jsonl"),
      });
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime); // most recent first
  return rows;
}

/** First substantive human prompt, for the picker preview. */
async function firstPrompt(file) {
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    return "(unreadable)";
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "user") continue;
    const c = obj.message?.content;
    const s = typeof c === "string" ? c : Array.isArray(c) ? c.find((p) => p?.type === "text")?.text : "";
    const t = (s ?? "").trim();
    if (!t || t.startsWith("<") || t.startsWith("[")) continue; // skip meta / tool results
    return t.replace(/\s+/g, " ").slice(0, 88);
  }
  return "(no prompt)";
}

// ---- interactive picker ---------------------------------------------------

async function pickSession() {
  const rows = await listSessions();
  if (rows.length === 0) {
    console.error(`No sessions found under ${PROJECTS}.`);
    return null;
  }
  if (!process.stdin.isTTY) {
    console.error("Not a TTY — defaulting to the most recent session.");
    return toSession(rows[0]);
  }
  const idx = await arrowPick(rows);
  if (idx == null) {
    console.error("Cancelled.");
    return null;
  }
  return toSession(rows[idx]);
}

function toSession(r) {
  return { file: r.file, label: `${r.project} · ${r.id.slice(0, 8)}` };
}

function arrowPick(rows) {
  return new Promise((resolve) => {
    let sel = 0;
    const view = Math.min(rows.length, 12);
    const render = (first) => {
      if (!first) process.stdout.write(`\x1b[${view + 2}A`); // move cursor up to redraw
      process.stdout.write("\x1b[0J"); // clear below
      console.log("  Select a session  (↑/↓ move · enter open · q quit)\n");
      const start = Math.min(Math.max(0, sel - Math.floor(view / 2)), Math.max(0, rows.length - view));
      for (let i = start; i < start + view; i++) {
        const r = rows[i];
        const on = i === sel;
        const head = `${on ? "\x1b[7m❯ " : "  "}${r.project.padEnd(22).slice(0, 22)}  ${r.kb}KB  ${ago(r.mtime)}`;
        console.log(`${head}  ${r.prompt}${on ? "\x1b[0m" : ""}`);
      }
    };
    render(true);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const done = (val) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKey);
      resolve(val);
    };
    const onKey = (_str, key) => {
      if (!key) return;
      if (key.name === "up") sel = (sel - 1 + rows.length) % rows.length;
      else if (key.name === "down") sel = (sel + 1) % rows.length;
      else if (key.name === "return") return done(sel);
      else if (key.name === "q" || (key.ctrl && key.name === "c")) return done(null);
      else return;
      render(false);
    };
    process.stdin.on("keypress", onKey);
  });
}

// ---- open the browser -----------------------------------------------------

/**
 * Open the hosted app at a URL with a (possibly very long) fragment. We write a
 * tiny local redirect page and open that, rather than passing the URL as a shell
 * argument — the fragment can be megabytes, past the OS argument-length limit.
 */
async function openUrl(url) {
  const file = join(tmpdir(), `review-debrief-${Date.now()}.html`);
  const html = `<!doctype html><meta charset="utf-8"><title>Opening Session Debrief…</title><script>location.replace(${JSON.stringify(url)})</script><p>Opening Session Debrief…</p>`;
  await writeFile(file, html, "utf8");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [file], { detached: true, stdio: "ignore" }).unref();
  } catch {
    console.error(`Open this file in your browser: ${file}`);
  }
}

// ---- tiny utils -----------------------------------------------------------

function projectLabel(dir) {
  const slug = basename(dir).replace(/^-Users-[^-]+-?/, "");
  return slug || "home";
}
function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function readdirSyncSafe(d) {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
