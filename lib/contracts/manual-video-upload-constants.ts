/**
 * Manual video upload constants safe for next.config.ts and other leaf imports.
 * No Zod, no @/ aliases — keep this file import-free.
 */

/** Catalog / job provider key for Operator manual upload (US-X.4 seed). */
export const MANUAL_PROVIDER_KEY = "manual" as const;

/** Thrown by manual adapter vendor I/O methods — sync orchestrator owns I/O. */
export const MANUAL_UPLOAD_SYNC_ONLY = "MANUAL_UPLOAD_SYNC_ONLY" as const;

/** Server-generated external_job_id prefix for manual jobs. */
export const MANUAL_EXTERNAL_JOB_ID_PREFIX = "manual-" as const;

/** Duration probe library frozen in US-8.3 CONTRACT. */
export const MANUAL_UPLOAD_DURATION_PROBE_LIBRARY = "mp4box" as const;

/** Default next.config serverActions.bodySizeLimit BUILD target (≥ getMaxVideoBytes()). */
export const MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT = "52mb" as const;

/** Display hints only — server enforces via env + validator (CONTRACT). */
export const MANUAL_UPLOAD_HINT_MAX_VIDEO_MIB = 50 as const;
export const MANUAL_UPLOAD_HINT_MAX_DURATION_SEC = 30 as const;
