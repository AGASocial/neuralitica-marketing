/**
 * Fly worker safety — require-user must load under --conditions=react-server
 * without pulling next/navigation (React.createContext missing).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(__dirname, "../..");

describe("require-user worker-safe under react-server", () => {
  it("loads create-branding-job-for-assembly without createContext crash", () => {
    const script = `
      import("./lib/assembly/create-branding-job-for-assembly.ts").then((m) => {
        if (typeof m.createBrandingJobForAssembly !== "function") {
          console.error("MISSING_EXPORT");
          process.exit(2);
        }
        console.log("BRANDING_MODULE_OK");
      }).catch((e) => {
        console.error(String(e && e.message ? e.message : e));
        process.exit(1);
      });
    `;

    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_OPTIONS: "--conditions=react-server --import tsx",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /BRANDING_MODULE_OK/);
    assert.doesNotMatch(
      result.stderr + result.stdout,
      /createContext is not a function/,
    );
  });
});
