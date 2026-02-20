import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // 1. Global Ignores
  {
    ignores: ["dist/**", "node_modules/**", "out/**"],
  },

  // 2. Main Extension Code (TypeScript)
  {
    files: ["src/**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // 3. Webview Code (Pure Browser JS)
  {
    files: ["webview/**/*.js"],
    extends: [eslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        acquireVsCodeApi: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      // Allow unused args in event handlers
      "no-unused-vars": "off",
      // Allow lexical declarations in case blocks
      "no-case-declarations": "off",
    },
  },
);
