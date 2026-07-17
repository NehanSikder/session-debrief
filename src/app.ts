import "./styles.css";
import { clear, el, svg } from "./view/dom";
import { parseSession } from "./parser";
import { analyze } from "./analyzer";
import { renderDebrief } from "./view";

const app = document.getElementById("app");
if (!app) throw new Error("#app root not found");
const root = app;

/** Render the initial upload screen (plan §8). */
function showUpload(extra?: HTMLElement): void {
  const fileInput = el("input", {
    type: "file",
    accept: ".jsonl,.json,application/jsonl,text/plain",
    style: "display:none",
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
  });

  const pick = el("button", { class: "btn primary", type: "button" }, ["Choose a .jsonl file"]);
  pick.addEventListener("click", (e) => {
    e.stopPropagation(); // the dropzone is clickable too; don't open the dialog twice
    fileInput.click();
  });

  const icon = svg("svg", { class: "dz-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, [
    svg("path", {
      d: "M12 15V4m0 0L8 8m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.6",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  ]);

  const dropzone = el(
    "div",
    {
      class: "dropzone",
      role: "button",
      tabindex: "0",
      "aria-label": "Drop a .jsonl session file here, or choose one",
    },
    [
      icon,
      el("p", { class: "dz-title" }, ["Drag & drop your ", el("code", {}, [".jsonl"]), " session here"]),
      el("p", { class: "dz-or" }, ["or"]),
      pick,
    ],
  );

  const openDialog = (): void => fileInput.click();
  dropzone.addEventListener("click", openDialog);
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDialog();
    }
  });
  dropzone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dropzone.classList.add("over");
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("over");
  });
  dropzone.addEventListener("dragleave", (e) => {
    // ignore moves onto a child; only clear when the pointer truly leaves the zone
    if (!dropzone.contains(e.relatedTarget as Node | null)) dropzone.classList.remove("over");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation(); // handled here; don't let the window handler load it again
    dropzone.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });

  const upload = el("div", { class: "upload" }, [
    el("h1", {}, ["Session Debrief"]),
    el("p", {}, [
      "Turn a Claude Code session into a fast debrief: the decisions, the corrections, and where each one lives in the transcript.",
    ]),
    dropzone,
    fileInput,
    el("p", { class: "hint" }, [
      "Sessions live in ~/.claude/projects/. Everything runs in your browser. Nothing is uploaded.",
    ]),
  ]);

  clear(root);
  const wrap = el("div", { class: "wrap" }, extra ? [extra, upload] : [upload]);
  root.append(wrap);
}

function errorNote(message: string): HTMLElement {
  return el("div", { class: "error-note" }, [el("b", {}, ["Couldn't read that file. "]), message]);
}

/** Parse + analyze + render, or surface a friendly error. */
function loadText(text: string, source: string): void {
  let model;
  try {
    model = parseSession(text);
  } catch (e) {
    showUpload(errorNote(e instanceof Error ? e.message : "Unexpected parse error."));
    return;
  }

  if (model.turns.length === 0) {
    const detail = model.warnings.length
      ? `Parsed ${model.warnings.length} lines but found no human turns. Is this a Claude Code session file?`
      : "No human turns were found. Is this a Claude Code session file?";
    showUpload(errorNote(detail));
    return;
  }

  renderDebrief(root, analyze(model), { source, onReset: () => showUpload() });
}

async function loadFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    loadText(text, file.name);
  } catch {
    showUpload(errorNote("The file could not be opened."));
  }
}

/**
 * When opened by the review skill, the session is handed off in the URL fragment
 * as `#s=<gzip+base64url>` (with an optional `n=<label>`). Fragments never reach
 * a server, so the data stays between the skill and your browser. Decode it and
 * render straight to the debrief.
 */
async function loadFromHash(s: string, label: string): Promise<void> {
  try {
    const text = await gunzip(base64urlToBytes(s));
    loadText(text, label);
  } catch {
    showUpload(errorNote("Could not read the session from this link."));
  }
}

function base64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  b64 += "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

// Window-level drag/drop works on any screen (upload or a rendered debrief).
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

const hash = new URLSearchParams(location.hash.slice(1));
const handoff = hash.get("s");
if (handoff) {
  void loadFromHash(handoff, hash.get("n") || "shared session");
} else {
  showUpload();
}
