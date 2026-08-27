import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.tsx",
      "tests/api/**/*.test.ts"
    ]
  }
});
