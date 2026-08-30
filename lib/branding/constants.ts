/** Bundled worker font directory — never client-influenced (US-9.2 SECURITY). */
export const BUNDLED_FONT_DIR = "/opt/neuramark/fonts" as const;

/** Frozen typography for 1080×1920 Reels (US-9.2 CONTRACT). */
export const BRANDING_ASS_FONT_NAME = "DejaVu Sans Bold" as const;
export const BRANDING_ASS_FONT_SIZE = 48 as const;
export const BRANDING_ASS_PLAY_RES_X = 1080 as const;
export const BRANDING_ASS_PLAY_RES_Y = 1920 as const;
/** Bottom-center alignment (ASS alignment 2). */
export const BRANDING_ASS_ALIGNMENT = 2 as const;
/** MarginV — baseline in safe zone (~y 1280–1520 from top). */
export const BRANDING_ASS_MARGIN_V = 640 as const;
export const BRANDING_ASS_MARGIN_LR = 54 as const;
/** Logo overlay max width @ 1080w (~12%). */
export const BRANDING_LOGO_MAX_WIDTH_PX = 130 as const;
export const BRANDING_LOGO_PADDING_PX = 48 as const;

export const BRANDING_JOB_POLL_INTERVAL_MS_DEFAULT = 3000 as const;
export const NEURAMARK_BRANDING_STALE_TIMEOUT_MIN_DEFAULT = 15 as const;

export const BRANDING_STALE_FAILURE_MESSAGE_KEY =
  "scripts.branding.failure.staleTimeout" as const;
