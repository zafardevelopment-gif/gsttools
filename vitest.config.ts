import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws unconditionally when imported outside a React
      // Server Component (its main entry is a bare `throw`). Next avoids that
      // via the "react-server" export condition, which vitest's node
      // environment does not apply — so point it at the package's own no-op
      // build. Without this, importing any server module from a test fails
      // before a single assertion runs.
      "server-only": "server-only/empty.js",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
