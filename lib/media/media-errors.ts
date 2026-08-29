import type {
  DeleteAvatarReferenceAssetErrorCode,
  DeleteAvatarReferenceAssetResult,
  MediaUploadErrorCode,
  UploadAvatarReferenceAssetResult,
} from "@/lib/contracts/media-assets";

export function mediaUploadError(
  code: MediaUploadErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): Extract<UploadAvatarReferenceAssetResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function mediaUploadValidationError(
  fields: Record<string, string[]>,
): Extract<UploadAvatarReferenceAssetResult, { ok: false }> {
  return mediaUploadError(
    "VALIDATION_ERROR",
    "preferences.references.errors.validation",
    { fields },
  );
}

export function mediaUploadForbiddenFieldsError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "FORBIDDEN_FIELDS",
    "preferences.references.errors.forbiddenFields",
  );
}

export function mediaUploadMissingFileError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "MISSING_FILE",
    "preferences.references.errors.missingFile",
  );
}

export function mediaUploadInvalidFileTypeError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "INVALID_FILE_TYPE",
    "preferences.references.errors.invalidFileType",
  );
}

export function mediaUploadFileTooLargeError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "FILE_TOO_LARGE",
    "preferences.references.errors.fileTooLarge",
  );
}

export function mediaUploadVideoTooLongError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "VIDEO_TOO_LONG",
    "preferences.references.errors.videoTooLong",
  );
}

export function mediaUploadAssetLimitReachedError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "ASSET_LIMIT_REACHED",
    "preferences.references.errors.assetLimitReached",
  );
}

export function mediaUploadOwnAvatarConsentRequiredError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "OWN_AVATAR_CONSENT_REQUIRED",
    "preferences.errors.ownAvatarConsentRequired",
  );
}

export function mediaUploadInternalError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError(
    "INTERNAL_ERROR",
    "preferences.references.errors.internal",
  );
}

export function mediaUploadUnauthenticatedError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function mediaUploadForbiddenError(): Extract<
  UploadAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaUploadError("FORBIDDEN", "auth.errors.forbidden");
}

export function mediaDeleteError(
  code: DeleteAvatarReferenceAssetErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): Extract<DeleteAvatarReferenceAssetResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function mediaDeleteValidationError(
  fields?: Record<string, string[]>,
): Extract<DeleteAvatarReferenceAssetResult, { ok: false }> {
  return mediaDeleteError(
    "VALIDATION_ERROR",
    "preferences.references.errors.validation",
    fields ? { fields } : undefined,
  );
}

export function mediaDeleteForbiddenFieldsError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError(
    "FORBIDDEN_FIELDS",
    "preferences.references.errors.forbiddenFields",
  );
}

export function mediaDeleteNotFoundError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError(
    "NOT_FOUND",
    "preferences.references.errors.notFound",
  );
}

export function mediaDeleteReferencedByJobError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError(
    "ASSET_REFERENCED_BY_JOB",
    "preferences.references.errors.referencedByJob",
  );
}

export function mediaDeleteInternalError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError(
    "INTERNAL_ERROR",
    "preferences.references.errors.internal",
  );
}

export function mediaDeleteUnauthenticatedError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function mediaDeleteForbiddenError(): Extract<
  DeleteAvatarReferenceAssetResult,
  { ok: false }
> {
  return mediaDeleteError("FORBIDDEN", "auth.errors.forbidden");
}
