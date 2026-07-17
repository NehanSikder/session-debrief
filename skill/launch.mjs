#!/usr/bin/env node
// review-debrief launcher (manual drag-and-drop).
//
// Opens the hosted Session Debrief site and reveals your current session's
// .jsonl in the file explorer, then prints what to do. You drag the file onto
// the page and the site parses it — entirely in your browser. This script does
// not read, upload, or transmit the session at all; it only opens two windows.
//
//   node launch.mjs   -> the session you're in now ($CLAUDE_CODE_SESSION_ID)

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PROJECTS = join(homedir(), ".claude", "projects");
const HOSTED = (process.env.SESSION_DEBRIEF_URL || "https://nehansikder.github.io/session-debrief/").replace(
  /#.*$/,
  "",
);

function main() {
  const file = resolveCurrent();
  if (!file) process.exit(1);

  const openedSite = openUrl(HOSTED);
  const revealed = revealFile(file);

  console.log("\n  Review this session in Session Debrief\n");
  console.log(`  1. A browser tab is opening:  ${HOSTED}`);
  console.log("  2. Your file explorer is opening with this file highlighted:");
  console.log(`       ${file}`);
  console.log("  3. Drag that .jsonl onto the page (or click 'Choose a .jsonl file' and select it).");
  console.log("\n  Everything runs in your browser — nothing is uploaded.\n");

  if (!openedSite) console.log(`  (Couldn't open the browser automatically — visit ${HOSTED} yourself.)`);
  if (!revealed) console.log(`  (Couldn't open the file explorer — the file is at the path above.)`);
}

// ---- session resolution ---------------------------------------------------

function resolveCurrent() {
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) {
    console.error("No CLAUDE_CODE_SESSION_ID in the environment — can't resolve the current session.");
    return null;
  }
  const file = findSessionFile(sid);
  if (!file) {
    console.error(`Couldn't find a .jsonl for session ${sid} under ${PROJECTS}.`);
    return null;
  }
  return file;
}

function findSessionFile(sid) {
  if (!existsSync(PROJECTS)) return null;
  for (const proj of readdirSyncSafe(PROJECTS)) {
    const candidate = join(PROJECTS, proj, `${sid}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ---- open browser + file explorer -----------------------------------------

function run(cmd, args) {
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

function openUrl(url) {
  if (process.platform === "darwin") return run("open", [url]);
  if (process.platform === "win32") return run("cmd", ["/c", "start", "", url]);
  return run("xdg-open", [url]);
}

/** Reveal a file in the OS file explorer, selected/highlighted where possible. */
function revealFile(file) {
  if (process.platform === "darwin") return run("open", ["-R", file]);
  if (process.platform === "win32") return run("explorer", ["/select,", file]);
  return run("xdg-open", [dirname(file)]); // Linux: open the containing folder
}

// ---- tiny utils -----------------------------------------------------------

function readdirSyncSafe(d) {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
}

main();
