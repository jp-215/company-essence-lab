import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Standalone from vite.config.ts on purpose: the Lovable TanStack config adds
 * the Start/nitro/router plugins, which try to build a server bundle and are
 * not wanted for a plain node test run.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
