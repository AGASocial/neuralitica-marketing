import {
  BUNDLED_FONT_DIR,
  BRANDING_LOGO_MAX_WIDTH_PX,
  BRANDING_LOGO_PADDING_PX,
} from "./constants";

export type BuildReelV1BrandingArgsInput = {
  localBasePath: string;
  localBrandedPath: string;
  localAssPath?: string;
  localLogoPath?: string;
  burnSubtitles: boolean;
  overlayLogo: boolean;
};

const ENCODE_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
] as const;

function subtitlesFilter(assPath: string): string {
  return `subtitles=${assPath}:fontsdir=${BUNDLED_FONT_DIR}`;
}

/**
 * Build argv for `spawn('ffmpeg', args, { shell: false })` — US-9.2 branding pass.
 * Paths must be server-controlled temp files only — never user/script text.
 */
export function buildReelV1BrandingArgs(
  input: BuildReelV1BrandingArgsInput,
): string[] {
  if (input.burnSubtitles && !input.localAssPath) {
    throw new Error("localAssPath required when burnSubtitles is true");
  }
  if (input.overlayLogo && !input.localLogoPath) {
    throw new Error("localLogoPath required when overlayLogo is true");
  }

  if (!input.burnSubtitles && !input.overlayLogo) {
    return [
      "-y",
      "-i",
      input.localBasePath,
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      input.localBrandedPath,
    ];
  }

  const args: string[] = ["-y", "-i", input.localBasePath];

  if (input.burnSubtitles && input.overlayLogo) {
    args.push("-i", input.localLogoPath!);
    const filterComplex = [
      `[0:v]${subtitlesFilter(input.localAssPath!)}[vsub]`,
      `[1:v]scale=${BRANDING_LOGO_MAX_WIDTH_PX}:-1[logo]`,
      `[vsub][logo]overlay=W-w-${BRANDING_LOGO_PADDING_PX}:${BRANDING_LOGO_PADDING_PX}[vout]`,
    ].join(";");
    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      ...ENCODE_ARGS,
      input.localBrandedPath,
    );
    return args;
  }

  if (input.burnSubtitles) {
    args.push(
      "-vf",
      subtitlesFilter(input.localAssPath!),
      "-map",
      "0:v",
      "-map",
      "0:a?",
      ...ENCODE_ARGS,
      input.localBrandedPath,
    );
    return args;
  }

  args.push(
    "-i",
    input.localLogoPath!,
    "-filter_complex",
    `[1:v]scale=${BRANDING_LOGO_MAX_WIDTH_PX}:-1[logo];[0:v][logo]overlay=W-w-${BRANDING_LOGO_PADDING_PX}:${BRANDING_LOGO_PADDING_PX}[vout]`,
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    ...ENCODE_ARGS,
    input.localBrandedPath,
  );
  return args;
}
