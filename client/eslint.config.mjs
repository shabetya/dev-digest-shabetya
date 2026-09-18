// Flat ESLint config. Minimal on purpose — this repo's client package had no
// prior ESLint setup; this config exists primarily to enforce the `@/*`
// import-alias convention (see AGENTS.md / CLAUDE.md and the
// `frontend-architecture` skill: "prefer an absolute import alias over long
// relative paths once nesting grows") and stop deep relative imports from
// creeping back in. `react-hooks/rules-of-hooks` + `exhaustive-deps` are
// registered too (just the two classic rules, not the newer React-Compiler
// rule set) because the codebase already carries
// `// eslint-disable-next-line react-hooks/exhaustive-deps` comments that
// assume they exist.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["node_modules/**", ".next/**", "src/vendor/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Matches any relative import that crosses TWO or more directory
              // levels up ("../../" or deeper) — a single "../" (one level) is
              // still allowed. Exempts `messages/en/*.json` fixture imports in
              // tests: `messages/` lives beside `src/`, not inside it, so
              // there's no `@/` alias that can reach it.
              regex: "^(\\.\\./){2,}(?!.*messages/)",
              message:
                "Relative imports crossing more than one directory level (../../ or deeper) are disallowed — use the '@/' alias instead (see tsconfig.json `paths`).",
            },
          ],
        },
      ],
    },
  },
);
