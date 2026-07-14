import type {
  ContentBlock,
  ParseResult,
  RawRecord,
  SessionModel,
  ToolCall,
  Turn,
} from "./types";

const INTERRUPT_RE = /interrupted by user/i;
const COMMAND_RE = /<command-name>|<local-command-stdout>|<local-command-caveat>/;
const FILE_INPUT_KEYS = ["file_path", "notebook_path", "path", "file"];

/** Text content blocks (ignores thinking/tool blocks). */
function textBlocks(content: string | ContentBlock[] | undefined): string[] {
  if (typeof content === "string") return content.trim() ? [content] : [];
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is { type: "text"; text?: string } => b?.type === "text")
    .map((b) => b.text ?? "")
    .filter((t) => t.trim());
}

/** The human text of a user record, or null if it is not a genuine human turn. */
function humanText(rec: RawRecord): string | null {
  if (rec.type !== "user" || rec.isSidechain || rec.isMeta) return null;
  const joined = textBlocks(rec.message?.content).join("\n").trim();
  return joined ? joined : null;
}

function toBlocks(content: string | ContentBlock[] | undefined): ContentBlock[] {
  return Array.isArray(content) ? content : [];
}

function filePathsFrom(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of FILE_INPUT_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}

/** Flatten a tool_result's content into a short plain-text string. */
function resultToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === "object" && "text" in b
          ? String((b as { text?: unknown }).text ?? "")
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function newTurn(index: number, at: Date, userText: string): Turn {
  return {
    index,
    at,
    userText,
    interrupted: INTERRUPT_RE.test(userText),
    isCommand: COMMAND_RE.test(userText),
    assistantText: "",
    assistantSummaryText: "",
    toolCalls: [],
    // filled in as the episode's records are walked
  };
}

/**
 * Build a SessionModel from raw records (plan §4).
 *
 * Walks records in order, grouping into episodes anchored by genuine human
 * turns. Assistant text and tool calls between two human turns belong to the
 * earlier one. tool_results are matched back to their tool_use by id (session-
 * wide, so a result that lands after a turn boundary still attaches correctly).
 * Sidechain (subagent) traffic is excluded from the main timeline.
 */
export function buildSession(parsed: ParseResult): SessionModel {
  const main = parsed.records.filter((r) => !r.isSidechain);

  const turns: Turn[] = [];
  const toolCallById = new Map<string, ToolCall>();
  let current: Turn | null = null;

  for (const rec of main) {
    const role = rec.message?.role;
    const human = humanText(rec);

    if (human !== null) {
      current = newTurn(turns.length, parseTime(rec.timestamp), human);
      turns.push(current);
      continue;
    }

    if (role === "assistant") {
      if (!current) continue; // assistant output before any human turn — ignore
      const blocks = toBlocks(rec.message?.content);
      const texts = textBlocks(rec.message?.content);
      if (texts.length) {
        const joined = texts.join("\n");
        current.assistantText = current.assistantText
          ? `${current.assistantText}\n${joined}`
          : joined;
        if (!current.assistantSummaryText) current.assistantSummaryText = texts[0].trim();
      }
      for (const b of blocks) {
        if (b.type !== "tool_use") continue;
        const input = (b.input && typeof b.input === "object" ? b.input : {}) as Record<
          string,
          unknown
        >;
        const call: ToolCall = {
          name: typeof b.name === "string" ? b.name : "tool",
          input,
          isError: false,
          filePaths: filePathsFrom(input),
          resultText: "",
        };
        current.toolCalls.push(call);
        if (typeof b.id === "string") toolCallById.set(b.id, call);
      }
      continue;
    }

    // user record that is not a human turn: tool_results carrying agent output
    for (const b of toBlocks(rec.message?.content)) {
      if (b.type !== "tool_result") continue;
      const id = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
      const call = id ? toolCallById.get(id) : undefined;
      if (!call) continue;
      if (b.is_error) call.isError = true;
      const rt = resultToText(b.content).trim();
      if (rt && !call.resultText) call.resultText = rt;
    }
  }

  const times = main
    .map((r) => r.timestamp)
    .filter((t): t is string => typeof t === "string")
    .map(parseTime)
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const sessionId =
    parsed.records.find((r) => typeof r.sessionId === "string")?.sessionId ?? "unknown";

  return {
    sessionId,
    startedAt: times[0] ?? new Date(0),
    endedAt: times[times.length - 1] ?? new Date(0),
    turns,
    warnings: parsed.warnings,
  };
}

function parseTime(ts: string | undefined): Date {
  return ts ? new Date(ts) : new Date(0);
}
