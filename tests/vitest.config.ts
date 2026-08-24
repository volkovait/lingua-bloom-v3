import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lingua-bloom/contracts": fileURLToPath(
        new URL("../packages/contracts/src/index.ts", import.meta.url)
      ),
      "@lingua-bloom/lesson-pipeline": fileURLToPath(
        new URL("../packages/lesson-pipeline/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    name: "cross-package",
    environment: "node",
    include: ["integration/**/*.test.ts", "resilience/**/*.test.ts", "security/**/*.test.ts"]
  }
});
