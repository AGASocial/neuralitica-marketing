import "server-only";

/**
 * US-15.1 Phase B — live rollout gates.
 * Frozen in CONTRACT.md § "Live activation, rollout and authority".
 *
 * Neither request/query/cookie/UI data nor `WEEKLY_CYCLE_DRY_RUN` enables
 * live execution — these three server env vars are the only authority.
 */
import { agentClientIdSchema } from "@/lib/contracts/profile";

const DEFAULT_MAX_CLIENTS = 3;
const MIN_MAX_CLIENTS = 1;
const MAX_MAX_CLIENTS = 25;

export function isWeeklyCycleLiveEnabled(): boolean {
  return process.env.WEEKLY_CYCLE_LIVE_ENABLED === "true";
}

/**
 * Parses `WEEKLY_CYCLE_LIVE_CLIENT_IDS` (comma-separated UUIDs).
 * Any invalid entry fails the whole allowlist closed (empty set) — per
 * CONTRACT: "any invalid entry fails closed for live execution".
 */
export function getWeeklyCycleLiveClientAllowlist(): ReadonlySet<string> {
  const raw = process.env.WEEKLY_CYCLE_LIVE_CLIENT_IDS?.trim();
  if (!raw) {
    return new Set();
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const parsed: string[] = [];
  for (const entry of entries) {
    const result = agentClientIdSchema.safeParse(entry);
    if (!result.success) {
      return new Set();
    }
    parsed.push(result.data);
  }

  return new Set(parsed);
}

export function getWeeklyCycleLiveMaxClients(): number {
  const raw = process.env.WEEKLY_CYCLE_LIVE_MAX_CLIENTS?.trim();
  if (!raw) {
    return DEFAULT_MAX_CLIENTS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_MAX_CLIENTS ||
    parsed > MAX_MAX_CLIENTS
  ) {
    return DEFAULT_MAX_CLIENTS;
  }
  return parsed;
}

export function isClientWeeklyCycleLiveAllowlisted(clientId: string): boolean {
  return getWeeklyCycleLiveClientAllowlist().has(clientId);
}

/**
 * Single gate call used at the root of every live entrypoint and before
 * every spend-producing step: kill switch AND per-client allowlist.
 */
export function isWeeklyCycleLiveAllowedForClient(clientId: string): boolean {
  return isWeeklyCycleLiveEnabled() && isClientWeeklyCycleLiveAllowlisted(clientId);
}

/** Cron selection helper: first N allowlisted+eligible clients, deterministic order. */
export function selectWeeklyCycleLiveClientIds(
  eligibleClientIdsInOrder: readonly string[],
): string[] {
  if (!isWeeklyCycleLiveEnabled()) {
    return [];
  }
  const allowlist = getWeeklyCycleLiveClientAllowlist();
  const max = getWeeklyCycleLiveMaxClients();
  const selected: string[] = [];
  for (const clientId of eligibleClientIdsInOrder) {
    if (selected.length >= max) break;
    if (allowlist.has(clientId)) selected.push(clientId);
  }
  return selected;
}
