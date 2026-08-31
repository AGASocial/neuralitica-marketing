import "server-only";

import type { LastChangeRequestDto } from "@/lib/contracts/approval";
import {
  changeRequestAuditEntrySchema,
  type ChangeRequestAuditEntry,
  type ChangeRequestClientRound,
} from "@/lib/contracts/approval-revision";

export function parseChangeRequests(raw: unknown): ChangeRequestAuditEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const entries: ChangeRequestAuditEntry[] = [];
  for (const item of raw) {
    const parsed = changeRequestAuditEntrySchema.safeParse(item);
    if (parsed.success) {
      entries.push(parsed.data);
    }
  }
  return entries;
}

export function getLastClientRevisionRound(
  entries: readonly ChangeRequestAuditEntry[],
): LastChangeRequestDto | undefined {
  const clientRounds = entries.filter(
    (entry): entry is ChangeRequestClientRound => entry.kind === "client_revision",
  );
  if (clientRounds.length === 0) {
    return undefined;
  }

  const latest = clientRounds.reduce((a, b) => (a.round >= b.round ? a : b));
  return {
    round: latest.round,
    tags: latest.tags,
    notesByTag: latest.notesByTag,
    summary: latest.summary,
    decidedAt: latest.decidedAt,
  };
}

export function findClientRevisionRound(
  entries: readonly ChangeRequestAuditEntry[],
  round: number,
): ChangeRequestClientRound | undefined {
  return entries.find(
    (entry): entry is ChangeRequestClientRound =>
      entry.kind === "client_revision" && entry.round === round,
  );
}

export function withRoutingStartedAt(
  entries: readonly ChangeRequestAuditEntry[],
  round: number,
  routingStartedAt: string,
): ChangeRequestAuditEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== "client_revision" || entry.round !== round) {
      return entry;
    }
    if (entry.routingStartedAt) {
      return entry;
    }
    return { ...entry, routingStartedAt };
  });
}

export function withRoutingCompletedAt(
  entries: readonly ChangeRequestAuditEntry[],
  round: number,
  routingCompletedAt: string,
): ChangeRequestAuditEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== "client_revision" || entry.round !== round) {
      return entry;
    }
    return { ...entry, routingCompletedAt };
  });
}
