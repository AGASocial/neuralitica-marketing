#!/usr/bin/env node
/**
 * Unit test entry (node:test + tsx).
 * H-01: classify failures before making CI hard-fail — workflow uses continue-on-error.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      collectTests(full, out);
    } else if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const roots = ["lib", "components", "app"].filter((d) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
});

const files = roots.flatMap((r) => collectTests(r));
if (files.length === 0) {
  console.log("No *.test.ts files found");
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
