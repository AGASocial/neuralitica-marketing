import { readFileSync } from "node:fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * `@typescript-eslint/no-require-imports` stays on for product code and for
 * every test that is not in this list. The list is the harness: each file
 * installs `Module._load` and/or deletes `require.cache` before `require()`
 * loads the module under test. A static import would run before that hook.
 * Node builtins in those files stay static imports. The production lazy
 * require in `lib/providers/provider-adapters.ts` is not listed here; it is
 * an inline exception on the single cycle-breaking call.
 */
const harnessAllowlist = JSON.parse(
  readFileSync(new URL("./eslint.require-harness-allowlist.json", import.meta.url), "utf8"),
);

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: harnessAllowlist.harnessTestFiles,
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
