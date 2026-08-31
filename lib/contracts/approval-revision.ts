/**
 * Approval revision round contract (US-11.2).
 * Extends US-11.1 decide surface with request_changes + operator grant.
 * FE imports types + constants; Zod validation stays server-side.
 */
import { z } from "zod";

/** Shared with US-11.1 feedback cap — defined here to avoid circular import with approval.ts. */
export const APPROVAL_CHANGE_NOTE_MAX_LENGTH = 500 as const;

/** Delimiter tag for Cliente change notes in script/caption LLM prompts (US-4.1 pattern). */
export const UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG =
  "UNTRUSTED_CLIENT_CHANGE_REQUEST" as const;

/** Server constant — env override `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` (staging only). */
export const APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT = 1 as const;

export const APPROVAL_OPERATOR_GRANT_AGENT_KEY =
  "approval_operator_grant" as const;
export const APPROVAL_OPERATOR_GRANT_MAX_PER_WINDOW = 10;

/** V1 taggable pipeline slices — Cliente must select ≥1. */
export const approvalChangeTagSchema = z.enum([
  "script",
  "caption",
  "assembly",
  "branding",
]);

export type ApprovalChangeTag = z.infer<typeof approvalChangeTagSchema>;

export const APPROVAL_CHANGE_TAGS = approvalChangeTagSchema.options;

const optionalChangeNoteSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(APPROVAL_CHANGE_NOTE_MAX_LENGTH)
      .transform((value) => (value.length === 0 ? undefined : value)),
  )
  .optional();

/** Cliente submit payload — companion to decideApproval when decision = request_changes. */
export const changeRequestInputSchema = z
  .object({
    tags: z
      .array(approvalChangeTagSchema)
      .min(1)
      .transform((tags) => [...new Set(tags)]),
    notesByTag: z
      .record(approvalChangeTagSchema, optionalChangeNoteSchema)
      .optional(),
    summary: optionalChangeNoteSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.notesByTag) {
      for (const key of Object.keys(data.notesByTag)) {
        if (!data.tags.includes(key as ApprovalChangeTag)) {
          ctx.addIssue({
            code: "custom",
            path: ["notesByTag", key],
            message: "TAG_NOT_SELECTED",
          });
        }
      }
    }
  });

export type ChangeRequestInput = z.infer<typeof changeRequestInputSchema>;

/** Persisted client revision round — server-built append-only (Cliente never sends round index). */
export const changeRequestClientRoundSchema = z
  .object({
    kind: z.literal("client_revision"),
    round: z.number().int().min(1),
    tags: z.array(approvalChangeTagSchema).min(1),
    notesByTag: z
      .record(approvalChangeTagSchema, z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH))
      .optional(),
    summary: z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH).optional(),
    decidedAt: z.string().datetime({ offset: true }),
    decidedBy: z.string().uuid(),
    routingStartedAt: z.string().datetime({ offset: true }).optional(),
    routingCompletedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ChangeRequestClientRound = z.infer<
  typeof changeRequestClientRoundSchema
>;

/** Operator one-shot grant audit entry — appended to change_requests JSONB array. */
export const changeRequestOperatorGrantSchema = z
  .object({
    kind: z.literal("operator_grant"),
    grantedAt: z.string().datetime({ offset: true }),
    grantedBy: z.string().uuid(),
    reason: z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH),
  })
  .strict();

export type ChangeRequestOperatorGrant = z.infer<
  typeof changeRequestOperatorGrantSchema
>;

export const changeRequestAuditEntrySchema = z.discriminatedUnion("kind", [
  changeRequestClientRoundSchema,
  changeRequestOperatorGrantSchema,
]);

export type ChangeRequestAuditEntry = z.infer<
  typeof changeRequestAuditEntrySchema
>;

/** Read-only slice on package DTO — last client revision round (if any). */
export const lastChangeRequestDtoSchema = z
  .object({
    round: z.number().int().min(1),
    tags: z.array(approvalChangeTagSchema).min(1),
    notesByTag: z
      .record(approvalChangeTagSchema, z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH))
      .optional(),
    summary: z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH).optional(),
    decidedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type LastChangeRequestDto = z.infer<typeof lastChangeRequestDtoSchema>;

/** Server-only revision invoke trust boundary — not accepted from browser regen actions. */
export const approvalRevisionInvokerSchema = z.literal("revision");

export type ApprovalRevisionInvoker = z.infer<
  typeof approvalRevisionInvokerSchema
>;

/** Built by router from persisted round + wrapUntrusted notes — script/caption agents only. */
export const revisionContextSchema = z
  .object({
    approvalId: z.string().uuid(),
    round: z.number().int().min(1),
    tags: z.array(approvalChangeTagSchema).min(1),
    delimitedNotesByTag: z
      .record(
        approvalChangeTagSchema,
        z.string().min(1).max(APPROVAL_CHANGE_NOTE_MAX_LENGTH + 64),
      )
      .optional(),
    delimitedSummary: z
      .string()
      .min(1)
      .max(APPROVAL_CHANGE_NOTE_MAX_LENGTH + 64)
      .optional(),
  })
  .strict();

export type RevisionContext = z.infer<typeof revisionContextSchema>;

/** Params for server-only routeApprovalChangeRequest (import "server-only"). */
export const routeApprovalChangeRequestParamsSchema = z
  .object({
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    clientId: z.string().uuid(),
    round: z.number().int().min(1),
    changeRequest: changeRequestInputSchema,
  })
  .strict();

export type RouteApprovalChangeRequestParams = z.infer<
  typeof routeApprovalChangeRequestParamsSchema
>;

/** Params for server-only requeueApprovalAfterRevision (import "server-only"). */
export const requeueApprovalAfterRevisionParamsSchema = z
  .object({
    approvalId: z.string().uuid(),
    clientId: z.string().uuid(),
    round: z.number().int().min(1),
    pathKind: z.enum(["caption_only", "media"]),
  })
  .strict();

export type RequeueApprovalAfterRevisionParams = z.infer<
  typeof requeueApprovalAfterRevisionParamsSchema
>;

export const operatorGrantExtraRevisionInputSchema = z
  .object({
    approvalId: z.string().uuid(),
    reason: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1)
          .max(APPROVAL_CHANGE_NOTE_MAX_LENGTH),
      ),
  })
  .strict();

export type OperatorGrantExtraRevisionInput = z.infer<
  typeof operatorGrantExtraRevisionInputSchema
>;

export const operatorGrantExtraRevisionSuccessSchema = z
  .object({
    ok: z.literal(true),
    approvalId: z.string().uuid(),
    extraRevisionGranted: z.literal(true),
    grantedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OperatorGrantExtraRevisionSuccess = z.infer<
  typeof operatorGrantExtraRevisionSuccessSchema
>;

/** Pipeline steps the revision router may enqueue (ordered). */
export const revisionPipelineStepSchema = z.enum([
  "script_regen",
  "video_job",
  "tts",
  "assembly",
  "branding",
  "qa_rerun",
  "caption_regen",
]);

export type RevisionPipelineStep = z.infer<typeof revisionPipelineStepSchema>;

/** Maximal-path expansion result — computed server-side from tags only. */
export const revisionRoutingPlanSchema = z
  .object({
    pathKind: z.enum(["caption_only", "media"]),
    steps: z.array(revisionPipelineStepSchema).min(1),
    tags: z.array(approvalChangeTagSchema).min(1),
  })
  .strict();

export type RevisionRoutingPlan = z.infer<typeof revisionRoutingPlanSchema>;

/** Keys forbidden inside changeRequest / notesByTag (one-level nested scan). */
export const FORBIDDEN_CHANGE_REQUEST_NESTED_KEYS = [
  "revision_count",
  "revisionCount",
  "extra_revision_granted",
  "extraRevisionGranted",
  "change_requests",
  "changeRequests",
  "status",
  "round",
  "decidedBy",
  "decided_by",
  "decidedAt",
  "decided_at",
  "clientId",
  "client_id",
  "qaPassed",
  "qa_passed",
  "ready",
  "invokedBy",
  "invoked_by",
  "routingStartedAt",
  "routingCompletedAt",
  "kind",
  "grantedBy",
  "granted_by",
] as const;

export type ForbiddenChangeRequestNestedKey =
  (typeof FORBIDDEN_CHANGE_REQUEST_NESTED_KEYS)[number];

/**
 * One-level nested forbidden-key scan for changeRequest payload (US-11.2).
 * Call after top-level decide scan, before Zod parse.
 */
export function findForbiddenChangeRequestKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const forbidden = new Set<string>(FORBIDDEN_CHANGE_REQUEST_NESTED_KEYS);
  const record = raw as Record<string, unknown>;
  const hits: string[] = [];

  for (const key of Object.keys(record)) {
    if (forbidden.has(key)) {
      hits.push(key);
    }
  }

  const notesByTag = record.notesByTag ?? record.notes_by_tag;
  if (
    notesByTag !== null &&
    typeof notesByTag === "object" &&
    !Array.isArray(notesByTag)
  ) {
    for (const key of Object.keys(notesByTag as Record<string, unknown>)) {
      if (forbidden.has(key)) {
        hits.push(`notesByTag.${key}`);
      }
    }
  }

  return hits;
}

export function computeRevisionsRemaining(params: {
  revisionCount: number;
  maxRevisionRounds: number;
  extraRevisionGranted: boolean;
  status: string;
}): number {
  if (params.status !== "pending_client") {
    return Math.max(0, params.maxRevisionRounds - params.revisionCount);
  }

  const base = Math.max(0, params.maxRevisionRounds - params.revisionCount);
  if (params.extraRevisionGranted) {
    return base + 1;
  }
  return base;
}

/** Compute maximal routing plan from selected tags (PO freeze #4). */
export function computeRevisionRoutingPlan(
  tags: readonly ApprovalChangeTag[],
): RevisionRoutingPlan {
  const unique = [...new Set(tags)] as ApprovalChangeTag[];

  if (unique.includes("script")) {
    return {
      pathKind: "media",
      tags: unique,
      steps: [
        "script_regen",
        "video_job",
        "tts",
        "assembly",
        "branding",
        "qa_rerun",
      ],
    };
  }

  if (unique.includes("assembly")) {
    return {
      pathKind: "media",
      tags: unique,
      steps: ["assembly", "branding", "qa_rerun"],
    };
  }

  if (unique.includes("branding")) {
    return {
      pathKind: "media",
      tags: unique,
      steps: ["branding", "qa_rerun"],
    };
  }

  return {
    pathKind: "caption_only",
    tags: unique,
    steps: ["caption_regen"],
  };
}
