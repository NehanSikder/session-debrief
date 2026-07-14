import { parseJsonl } from "./parse";
import { buildSession } from "./turns";
import type { SessionModel } from "./types";

export { parseJsonl } from "./parse";
export { buildSession } from "./turns";
export type * from "./types";

/** Full parse: JSONL text → SessionModel. */
export function parseSession(text: string): SessionModel {
  return buildSession(parseJsonl(text));
}
