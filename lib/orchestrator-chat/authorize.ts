import type { CurrentUser, UserRole } from "@/lib/auth/get-current-user-types";
import type { OrchestratorToolError } from "@/lib/contracts/orchestrator-chat";

export function orchestratorForbidden(
  message?: string,
): OrchestratorToolError {
  return {
    ok: false,
    error: "FORBIDDEN",
    message: message ?? "This tool requires Operator role.",
  };
}

export function orchestratorValidationError(
  message?: string,
): OrchestratorToolError {
  return {
    ok: false,
    error: "VALIDATION_ERROR",
    message: message ?? "Invalid tool input.",
  };
}

export function requireOrchestratorRole(
  user: CurrentUser,
  allowed: UserRole[],
): OrchestratorToolError | null {
  if (!allowed.includes(user.role)) {
    return orchestratorForbidden();
  }
  return null;
}

export function isOperator(user: CurrentUser): boolean {
  return user.role === "operator";
}
