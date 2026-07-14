import type { ParseResult, RawRecord } from "./types";

/**
 * Parse Claude Code session JSONL into raw records.
 *
 * Tolerant by contract (plan §4): one bad line never kills the parse — it is
 * counted as a warning and skipped. The format is undocumented and versioned,
 * so we validate only the minimum (each line is a JSON object) and let unknown
 * shapes pass through untouched.
 */
export function parseJsonl(text: string): ParseResult {
  const records: RawRecord[] = [];
  const warnings: string[] = [];

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      warnings.push(`Line ${i + 1}: malformed JSON, skipped`);
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      warnings.push(`Line ${i + 1}: not a JSON object, skipped`);
      continue;
    }
    records.push(parsed as RawRecord);
  }

  return { records, warnings };
}
