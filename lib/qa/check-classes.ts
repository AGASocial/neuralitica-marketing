/**
 * QA check severity classification (US-3.4).
 * US-10.1 imports for check results; US-10.2 rejects override when blocking.
 */
export const QA_CHECK_SEVERITY = {
  blocking: "blocking",
  overridable: "overridable",
} as const;

export type QaCheckSeverity =
  (typeof QA_CHECK_SEVERITY)[keyof typeof QA_CHECK_SEVERITY];
