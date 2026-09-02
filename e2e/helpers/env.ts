import { loadEnvConfig } from "@next/env";

let loaded = false;

export function loadE2EEnv(): void {
  if (loaded) {
    return;
  }
  loadEnvConfig(process.cwd());
  loaded = true;
}
