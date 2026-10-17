import { defineConfig } from "vitest/config";
import path from "node:path";

const r = (p: string): string => path.resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      "@server": r("src/server"),
      "@shared": r("src/shared"),
      "@client": r("src/client"),
      "@components": r("src/components"),
      // `server-only` throws outside the React server condition; stub for unit tests.
      "server-only": r("tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/shared/**", "src/server/auth/session-token.ts"] },
  },
});
