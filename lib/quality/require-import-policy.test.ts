/**
 * Guards the no-require-imports exception list.
 *
 * Harness tests may call the CommonJS loader only when they install
 * Module._load or delete require.cache first. Product code stays strict.
 * The one production call is the lazy registry fallback in
 * lib/providers/provider-adapters.ts.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const allowlistPath = path.join(repoRoot, "eslint.require-harness-allowlist.json");

const callPattern = new RegExp("\\breq" + "uire\\s*\\(");
const nodeBuiltinCall = new RegExp("\\breq" + "uire\\(\\s*[\"']node:");

type Allowlist = {
  criteria: string;
  harnessTestFiles: string[];
  productException: {
    file: string;
    symbol: string;
    specifier: string;
  };
};

function readAllowlist(): Allowlist {
  return JSON.parse(readFileSync(allowlistPath, "utf8")) as Allowlist;
}

function walkSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") {
      continue;
    }
    const full = path.join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      walkSources(full, out);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function linesWithCall(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const code = lines[index].replace(/\/\/.*$/, "");
    if (callPattern.test(code)) {
      hits.push(index + 1);
    }
  }
  return hits;
}

describe("loader import policy", () => {
  it("allowlist is explicit, sorted, and limited to the harness criterion", () => {
    const allowlist = readAllowlist();
    assert.match(allowlist.criteria, /Module\._load/);
    assert.match(allowlist.criteria, /require\.cache/);
    assert.deepEqual(
      allowlist.harnessTestFiles,
      [...allowlist.harnessTestFiles].sort(),
    );
    assert.equal(
      new Set(allowlist.harnessTestFiles).size,
      allowlist.harnessTestFiles.length,
    );
    assert.equal(
      allowlist.harnessTestFiles.includes(allowlist.productException.file),
      false,
    );

    for (const rel of allowlist.harnessTestFiles) {
      assert.match(rel, /\.test\.ts$/);
      const source = readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(callPattern.test(source), true, `${rel} no longer calls the loader`);
      assert.equal(
        /_load\s*=/.test(source) || /require\.cache/.test(source),
        true,
        `${rel} is listed without a Module._load hook or require.cache deletion`,
      );
      assert.equal(
        nodeBuiltinCall.test(source),
        false,
        `${rel} still loads a node builtin through the loader`,
      );
    }
  });

  it("every loader call in app, components, and lib is allowlisted or the registry cycle", () => {
    const allowlist = readAllowlist();
    const allowed = new Set(allowlist.harnessTestFiles);
    const roots = ["app", "components", "lib"].map((dir) => path.join(repoRoot, dir));
    const offenders: string[] = [];
    let productHits = 0;

    for (const root of roots) {
      for (const full of walkSources(root)) {
        const rel = path.relative(repoRoot, full).split(path.sep).join("/");
        const source = readFileSync(full, "utf8");
        const hits = linesWithCall(source);
        if (hits.length === 0) {
          continue;
        }
        if (allowed.has(rel)) {
          continue;
        }
        if (rel === allowlist.productException.file) {
          productHits += hits.length;
          const lines = source.split("\n");
          assert.deepEqual(hits, [hits[0]]);
          const callLine = lines[hits[0] - 1];
          assert.match(callLine, /create-provider-registry/);
          const preamble = lines.slice(Math.max(0, hits[0] - 8), hits[0] - 1).join("\n");
          assert.match(preamble, /eslint-disable-next-line @typescript-eslint\/no-require-imports/);
          assert.match(preamble, /cycle/i);
          assert.match(source, /export async function estimateVideoJobCost/);
          continue;
        }
        for (const line of hits) {
          offenders.push(`${rel}:${line}`);
        }
      }
    }

    assert.deepEqual(offenders, []);
    assert.equal(productHits, 1);
  });

  it("create-provider-registry still imports provider-adapters statically", () => {
    const registry = readFileSync(
      path.join(repoRoot, "lib/providers/create-provider-registry.ts"),
      "utf8",
    );
    const adapters = readFileSync(
      path.join(repoRoot, "lib/providers/provider-adapters.ts"),
      "utf8",
    );
    assert.match(registry, /from "@\/lib\/providers\/provider-adapters"/);
    assert.equal(/from ["']\.\/create-provider-registry["']/.test(adapters), false);
  });

  it("ESLint still reports a loader call outside the harness list", async () => {
    const allowlist = readAllowlist();
    const eslint = new ESLint({ cwd: repoRoot });
    const loaderCall = ["req", "uire"].join("") + '("./local-module")';

    const unlisted = await eslint.lintText(`export const value = ${loaderCall};\n`, {
      filePath: path.join(repoRoot, "lib/quality/unlisted-require-probe.test.ts"),
    });
    assert.ok(
      unlisted[0]?.messages.some(
        (message) => message.ruleId === "@typescript-eslint/no-require-imports",
      ),
    );

    const product = await eslint.lintText(`export const value = ${loaderCall};\n`, {
      filePath: path.join(repoRoot, "lib/providers/provider-adapters.ts"),
    });
    assert.ok(
      product[0]?.messages.some(
        (message) => message.ruleId === "@typescript-eslint/no-require-imports",
      ),
      "product file must not disable the rule for the whole module",
    );

    const listedName = allowlist.harnessTestFiles[0];
    assert.ok(listedName);
    const listed = await eslint.lintText(`export const value = ${loaderCall};\n`, {
      filePath: path.join(repoRoot, listedName),
    });
    assert.equal(
      listed[0]?.messages.some(
        (message) => message.ruleId === "@typescript-eslint/no-require-imports",
      ),
      false,
    );

    const realProduct = await eslint.lintFiles([
      path.join(repoRoot, allowlist.productException.file),
    ]);
    assert.equal(
      realProduct[0]?.messages.some(
        (message) => message.ruleId === "@typescript-eslint/no-require-imports",
      ),
      false,
    );
  });
});
