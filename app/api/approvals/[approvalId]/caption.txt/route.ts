import "server-only";

import {
  authGuardResponse,
  isAuthGuardError,
  requireActive,
} from "@/lib/auth/require-user";
import {
  APPROVAL_EXPORT_AGENT_KEY,
  buildCaptionExportFilename,
} from "@/lib/contracts/approval";
import {
  checkApprovalRateLimit,
  recordApprovalAttempt,
} from "@/lib/approvals/check-approval-rate-limit";
import { composeApprovalPackage } from "@/lib/approvals/compose-approval-package";
import { loadApprovalByIdScoped } from "@/lib/approvals/persist-approval";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeFilenameForHeader(name: string): string {
  return name.replace(/["\\;\r\n]/g, "_").slice(0, 180);
}

function notFoundResponse(): Response {
  return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function rateLimitedResponse(): Response {
  return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function internalErrorResponse(): Response {
  return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
    status: 500,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Authenticated caption `.txt` export for approved Aprobación (US-11.3).
 * Body = server-composed effectiveCaption — never client-supplied.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ approvalId: string }> },
): Promise<Response> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (authError) {
    if (isAuthGuardError(authError)) {
      return authGuardResponse(authError);
    }
    throw authError;
  }

  const { approvalId } = await context.params;
  if (!approvalId || !UUID_RE.test(approvalId)) {
    return notFoundResponse();
  }

  const rateCheck = await checkApprovalRateLimit({
    clientId: user.id,
    agentKey: APPROVAL_EXPORT_AGENT_KEY,
  });
  if (!rateCheck.ok) {
    return rateLimitedResponse();
  }

  const approval = await loadApprovalByIdScoped({
    approvalId,
    clientId: user.id,
  });
  if (!approval || approval.status !== "approved") {
    return notFoundResponse();
  }

  const composed = await composeApprovalPackage({
    approval,
    clientId: user.id,
  });
  if (!composed.ok) {
    if (composed.code === "NOT_FOUND") {
      return notFoundResponse();
    }
    return internalErrorResponse();
  }

  await recordApprovalAttempt({
    clientId: user.id,
    agentKey: APPROVAL_EXPORT_AGENT_KEY,
  });

  const filename = sanitizeFilenameForHeader(
    buildCaptionExportFilename(approval.assembledReelId),
  );
  const body = composed.package.caption.effectiveCaption;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
