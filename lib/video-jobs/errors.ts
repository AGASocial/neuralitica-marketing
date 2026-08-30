import type {
  VideoJobErrorCode,
  VideoJobMutationError,
} from "@/lib/contracts/video-job";

export function videoJobMutationError(
  code: VideoJobErrorCode,
  options?: {
    messageKey?: string;
    fields?: Record<string, string[]>;
  },
): VideoJobMutationError {
  return {
    ok: false,
    error: {
      code,
      ...(options?.messageKey ? { messageKey: options.messageKey } : {}),
      ...(options?.fields ? { fields: options.fields } : {}),
    },
  };
}

export function videoJobUnauthenticatedError(): VideoJobMutationError {
  return videoJobMutationError("UNAUTHENTICATED");
}

export function videoJobForbiddenError(): VideoJobMutationError {
  return videoJobMutationError("FORBIDDEN");
}

export function videoJobNotFoundError(): VideoJobMutationError {
  return videoJobMutationError("NOT_FOUND");
}

export function videoJobForbiddenFieldsError(): VideoJobMutationError {
  return videoJobMutationError("FORBIDDEN_FIELDS");
}

export function videoJobInternalError(): VideoJobMutationError {
  return videoJobMutationError("INTERNAL_ERROR");
}
