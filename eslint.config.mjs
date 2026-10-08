import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "prisma/**",
  ]),

  // ── Project-wide rules ─────────────────────────────────────
  {
    rules: {
      // Enforce no TypeScript `any` — critical for this codebase.
      // Use unknown + type guards, proper generics, or explicit types instead.
      "@typescript-eslint/no-explicit-any": "error",

      // Disallow non-null assertions (!) — use proper null checks.
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Require explicit return types on exported functions.
      // Prevents silent type widening in service layer exports.
      "@typescript-eslint/explicit-module-boundary-types": "off", // too noisy for components; enforce manually in services

      // Prevent unused variables from silently accumulating.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Enforce consistent import order for readability.
      // (Would need eslint-plugin-import for full enforcement — added later)

      // Prevent console.log in committed code — use structured logging instead.
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React-specific: no need to import React in scope with new JSX transform.
      "react/react-in-jsx-scope": "off",
    },
  },

  // ── Server-only boundary ──────────────────────────────────
  // Files in src/server/ must not be imported from client code.
  // Full enforcement requires eslint-plugin-boundaries (Phase 12).
  // For now, add a comment reminder rule.
  {
    files: ["src/server/**/*.ts", "src/server/**/*.tsx"],
    rules: {
      // Server files should never import from src/client/
      // This is a naming-convention reminder; automated enforcement in Phase 12.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/client/*", "../client/*", "../../client/*"],
              message:
                "Server code must not import from src/client/. " +
                "Move shared code to src/shared/ instead.",
            },
          ],
        },
      ],
    },
  },

  // ── Client-only boundary ──────────────────────────────────
  {
    files: ["src/client/**/*.ts", "src/client/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "*/server/*",
                "../server/*",
                "../../server/*",
                "firebase-admin",
                "firebase-admin/*",
              ],
              message:
                "Client code must not import from src/server/ or firebase-admin. " +
                "Firebase Admin SDK is server-only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
