// @ts-check
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // ── Ignore patterns ────────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.pnpm-store/**",
      // Generated files — linted separately (or not at all)
      "lib/api-zod/src/generated/**",
      "lib/api-client-react/src/generated/**",
    ],
  },

  // ── Base JS rules for all files ────────────────────────────────────────────
  js.configs.recommended,

  // ── Node.js config files ──────────────────────────────────────────────────
  {
    files: ["*.mjs", "**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ── Backend: TypeScript (Node.js) ──────────────────────────────────────────
  {
    files: ["artifacts/api-server/src/**/*.ts", "lib/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: { ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // TypeScript safety
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Async safety — catch unhandled promises
      "no-console": "warn",
      // Prevent accidental var usage
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // ── Frontend: TypeScript + React ───────────────────────────────────────────
  {
    files: ["artifacts/trs-app/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React
      "react/jsx-uses-react": "off",        // Not needed with React 17+ JSX transform
      "react/react-in-jsx-scope": "off",    // Not needed with React 17+ JSX transform
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // TypeScript
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // General
      "no-console": "warn",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
