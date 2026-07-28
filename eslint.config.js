import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Only lint project source and test files
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // ── Complexity gates ─────────────────────────────────────────────────
      // Policy: file-size-and-counts.md — 10 soft / 15 hard.
      // Error at the hard cap; pre-existing offenders carry an inline
      // eslint-disable with a grandfathered marker until refactored.
      "complexity": ["error", 15],

      // Policy: 60 soft / 100 hard lines per function.
      // Warn at 80 (middle ground); skip blanks and comments.
      "max-lines-per-function": ["warn", {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
      }],

      // Nesting depth — warn at 5 levels (generous).
      "max-depth": ["warn", 5],

      // ── TypeScript-specific relaxations ─────────────────────────────────
      // Allow explicit `any` in test stubs and mapper utilities.
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unused vars prefixed with _ (common convention).
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    // Global ignores
    ignores: [
      "dist/**",
      "dist-cli/**",
      "node_modules/**",
      "public/**",
      "scripts/**",
      "hooks/**",
      "*.config.*",
    ],
  },
  {
    // Test files: relax rules that conflict with describe/it block structure
    files: ["tests/**/*.ts"],
    rules: {
      "max-lines-per-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
