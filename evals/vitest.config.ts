import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    // Token cap: a failing case is retried ONCE (max 2 attempts). Passing cases never re-run, so
    // this only spends tokens on genuine flakes. Override with `vitest run --retry=0` for 1 attempt.
    retry: 1,
    reporters: ["default", new TrendReporter()],
  },
});
