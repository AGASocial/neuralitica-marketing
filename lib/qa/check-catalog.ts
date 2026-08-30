/**
 * Immutable QA check catalog (US-10.1).
 *
 * Classification is code-only — no CRUD endpoint, Operator setting, or DB table.
 * US-10.2 MUST import this module for blocking override 403.
 */

import {
  QA_BLOCKING_CHECK_KEYS,
  QA_CHECK_KEYS,
  QA_DETERMINISTIC_CHECK_KEYS,
  QA_LLM_CHECK_KEYS,
  QA_OVERRIDABLE_CHECK_KEYS,
  catalogSeverityForCheckKey,
  type QaCheckKey,
  type QaCheckSeverity,
} from "@/lib/contracts/qa-report";
import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";
import { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY } from "@/lib/contracts/qa";

export {
  QA_BLOCKING_CHECK_KEYS,
  QA_CHECK_KEYS,
  QA_DETERMINISTIC_CHECK_KEYS,
  QA_LLM_CHECK_KEYS,
  QA_OVERRIDABLE_CHECK_KEYS,
  catalogSeverityForCheckKey,
  GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
  QA_CHECK_SEVERITY,
};

export type { QaCheckKey, QaCheckSeverity };

const QA_CHECK_KEY_SET = new Set<string>(QA_CHECK_KEYS);
const QA_BLOCKING_KEY_SET = new Set<string>(QA_BLOCKING_CHECK_KEYS);
const QA_OVERRIDABLE_KEY_SET = new Set<string>(QA_OVERRIDABLE_CHECK_KEYS);
const QA_LLM_KEY_SET = new Set<string>(QA_LLM_CHECK_KEYS);
const QA_DETERMINISTIC_KEY_SET = new Set<string>(QA_DETERMINISTIC_CHECK_KEYS);

/** Frozen V1 severity map — single source for merge + US-10.2. */
export const QA_CHECK_SEVERITY_BY_KEY: Readonly<
  Record<QaCheckKey, QaCheckSeverity>
> = Object.freeze(
  Object.fromEntries(
    QA_CHECK_KEYS.map((key) => [key, catalogSeverityForCheckKey(key)]),
  ) as Record<QaCheckKey, QaCheckSeverity>,
);

export function isKnownQaCheckKey(key: string): key is QaCheckKey {
  return QA_CHECK_KEY_SET.has(key);
}

export function isBlockingCheckKey(key: string): boolean {
  return QA_BLOCKING_KEY_SET.has(key);
}

export function isOverridableCheckKey(key: string): boolean {
  return QA_OVERRIDABLE_KEY_SET.has(key);
}

export function isLlmCheckKey(key: string): boolean {
  return QA_LLM_KEY_SET.has(key);
}

export function isDeterministicCheckKey(key: string): boolean {
  return QA_DETERMINISTIC_KEY_SET.has(key);
}

/**
 * Severity for a known check key. Unknown keys return null (caller must drop).
 */
export function severityForCheckKey(key: string): QaCheckSeverity | null {
  if (!isKnownQaCheckKey(key)) {
    return null;
  }
  return QA_CHECK_SEVERITY_BY_KEY[key];
}
