import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/.next/**", "**/dist/**", "**/coverage/**", "**/*.d.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        process: "readonly",
        TextEncoder: "readonly"
      }
    }
  }
);
