import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lingua-bloom/contracts": fileURLToPath(
        new URL("../packages/contracts/src/index.ts", import.meta.url)
      ),
      "@lingua-bloom/document-ingestion": fileURLToPath(
        new URL("../packages/document-ingestion/src/index.ts", import.meta.url)
      ),
      "@lingua-bloom/domain": fileURLToPath(
        new URL("../packages/domain/src/index.ts", import.meta.url)
      ),
      "@lingua-bloom/exercise-extraction": fileURLToPath(
        new URL("../packages/exercise-extraction/src/index.ts", import.meta.url)
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
