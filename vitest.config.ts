import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@askrigor/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@askrigor/protocol": fileURLToPath(
        new URL("./packages/protocol/src/index.ts", import.meta.url)
      ),
      "@askrigor/sources": fileURLToPath(
        new URL("./packages/sources/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000
  }
});
