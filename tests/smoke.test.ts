import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");

// Scaffold sanity: the toolchain runs and every fixture is valid JSONL.
describe("scaffold + fixtures", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".jsonl"));

  it("has at least three fixtures", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("%s is valid JSONL", (file) => {
    const text = readFileSync(join(fixturesDir, file), "utf8");
    const lines = text.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });
});
