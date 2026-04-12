import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/mcp/resources/**", "server/lib/supabase.ts", "server/lib/og-image.ts", "server/lib/og-meta.ts", "server/worker.ts"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
