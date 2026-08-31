import "server-only";

import {
  APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT,
  computeRevisionsRemaining,
} from "@/lib/contracts/approval-revision";

export { computeRevisionsRemaining };

/** Server authority for max client revision rounds — never from request body. */
export function getMaxRevisionRounds(): number {
  const raw = process.env.APPROVAL_MAX_CLIENT_REVISION_ROUNDS;
  if (raw === undefined || raw.trim() === "") {
    return APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT;
  }

  return parsed;
}
