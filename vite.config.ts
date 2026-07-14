import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the built app is servable from any path (file://-friendly,
  // and works when a skill drops it next to a session file — see plan §8).
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/parser/**", "src/analyzer/**"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
