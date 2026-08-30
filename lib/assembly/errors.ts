import type {
  AssemblyJobErrorCode,
  AssemblyJobMutationError,
} from "@/lib/contracts/assembly-job";

export function assemblyJobMutationError(
  code: AssemblyJobErrorCode,
  options?: {
    messageKey?: string;
    fields?: Record<string, string[]>;
  },
): AssemblyJobMutationError {
  return {
    ok: false,
    error: {
      code,
      ...(options?.messageKey ? { messageKey: options.messageKey } : {}),
      ...(options?.fields ? { fields: options.fields } : {}),
    },
  };
}

export function assemblyJobUnauthenticatedError(): AssemblyJobMutationError {
  return assemblyJobMutationError("UNAUTHENTICATED");
}

export function assemblyJobForbiddenError(): AssemblyJobMutationError {
  return assemblyJobMutationError("FORBIDDEN");
}

export function assemblyJobNotFoundError(): AssemblyJobMutationError {
  return assemblyJobMutationError("NOT_FOUND");
}

export function assemblyJobForbiddenFieldsError(): AssemblyJobMutationError {
  return assemblyJobMutationError("FORBIDDEN_FIELDS");
}

export function assemblyJobInternalError(): AssemblyJobMutationError {
  return assemblyJobMutationError("INTERNAL_ERROR");
}

export function assemblyInputsIncompleteError(
  messageKey: string,
): AssemblyJobMutationError {
  return assemblyJobMutationError("ASSEMBLY_INPUTS_INCOMPLETE", { messageKey });
}
