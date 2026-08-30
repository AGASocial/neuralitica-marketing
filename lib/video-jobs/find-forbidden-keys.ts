import {
  FORBIDDEN_BUDGET_SPEND_KEYS,
} from "@/lib/contracts/cost-policy";
import { FORBIDDEN_PROVIDER_AUTHORITY_KEYS } from "@/lib/contracts/provider-decisions";
import { FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS } from "@/lib/contracts/video-job";

const FORBIDDEN_VIDEO_JOB_KEYS = new Set<string>([
  ...FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS,
  ...FORBIDDEN_BUDGET_SPEND_KEYS,
  ...FORBIDDEN_PROVIDER_AUTHORITY_KEYS,
  "providerKey",
  "provider_key",
  "estimatedCostCents",
  "estimated_cost_cents",
  "actualCostCents",
  "actual_cost_cents",
]);

export function findForbiddenVideoJobKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_VIDEO_JOB_KEYS.has(key));
}
