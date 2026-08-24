import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cross-package",
    environment: "node",
    include: ["integration/**/*.test.ts", "resilience/**/*.test.ts", "security/**/*.test.ts"]
  }
});
