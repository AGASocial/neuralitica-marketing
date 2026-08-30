import "server-only";

/**
 * Returns true when reel scripts exist for a strategy (US-5.1).
 * US-4.2 BUILD: always false — table not yet present.
 */
export async function strategyHasScripts(_strategyId: string): Promise<boolean> {
  return false;
}

export function isStrategyLockAfterScriptsEnabled(): boolean {
  return process.env.NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== "false";
}
