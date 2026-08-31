import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { probeLocalMediaFile } from "@/lib/assembly/probe-media-streams";
import { runFfmpeg } from "@/lib/assembly/run-ffmpeg";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";

import {
  computeVoiceoverTimingHash,
  computeVoProportionalBeatTimings,
} from "@/lib/assembly/compute-vo-proportional-beat-timings";

import { applyBrandingJobUpdate } from "./apply-branding-job-update";
import { buildAssFromBeats } from "./build-ass-from-beats";
import { buildReelV1BrandingArgs } from "./build-reel-v1-branding-args";
import {
  generateBrandedReelStorageKey,
  generateCoverFrameStorageKey,
  isTerminalBrandingStatus,
  VOICEOVER_TIMING_HASH_HEX_RE,
} from "./branding-job-row";
import {
  clampCoverSeekSec,
  extractCoverFrameArgs,
} from "./extract-cover-frame-args";
import {
  insertBrandedReelMediaAsset,
  insertCoverFrameMediaAsset,
} from "./insert-branded-media-assets";
import {
  loadBrandingJobByIdUnscoped,
  loadClientLogoAssetId,
  loadScriptBrandingContext,
} from "./load-branding-job";
import { loadMediaAssetForBranding } from "./load-media-asset-for-branding";
import { resolveSubtitleBeats } from "./resolve-subtitle-beats";
import { sanitizeSubtitleBeats } from "./sanitize-subtitle-beats";

export const BRANDING_FAILURE_TENANCY_MISMATCH =
  "scripts.branding.failure.tenancyMismatch" as const;
export const BRANDING_FAILURE_CONFIG =
  "scripts.branding.failure.configInvalid" as const;
export const BRANDING_FAILURE_FFMPEG =
  "scripts.branding.failure.ffmpegError" as const;
export const BRANDING_FAILURE_STORAGE =
  "scripts.branding.failure.storageError" as const;
export const BRANDING_FAILURE_SUBTITLE_HASH =
  "scripts.branding.failure.subtitleHashMismatch" as const;
export const BRANDING_FAILURE_VOICEOVER_TIMING_HASH =
  "scripts.branding.failure.voiceoverTimingHashMismatch" as const;

export type RunBrandingJobDeps = {
  runFfmpeg?: (args: string[]) => Promise<{ exitCode: number; stderr: string }>;
  probeLocalMediaFile?: (
    filePath: string,
  ) => Promise<{ durationSec: number; hasAudioStream: boolean } | null>;
};

async function failBrandingJob(
  assemblyJobId: string,
  failureReason: string,
): Promise<void> {
  await applyBrandingJobUpdate({
    assemblyJobId,
    patch: { brandingStatus: "failed", failureReason },
    source: "worker",
  });
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/**
 * Fly worker + dev in-process branding runner (US-9.2 Phase A).
 * Downloads owned assets via Storage SDK, writes ASS temp file, spawns ffmpeg twice.
 */
export async function runBrandingJob(
  assemblyJobId: string,
  deps: RunBrandingJobDeps = {},
): Promise<void> {
  const job = await loadBrandingJobByIdUnscoped(assemblyJobId);
  if (!job || isTerminalBrandingStatus(job.brandingStatus)) {
    return;
  }

  if (job.status !== "completed") {
    await failBrandingJob(job.id, BRANDING_FAILURE_CONFIG);
    return;
  }

  if (job.brandingStatus === "queued") {
    await applyBrandingJobUpdate({
      assemblyJobId: job.id,
      patch: { brandingStatus: "processing" },
      source: "worker",
    });
  }

  const activeJob = await loadBrandingJobByIdUnscoped(assemblyJobId);
  if (!activeJob || isTerminalBrandingStatus(activeJob.brandingStatus)) {
    return;
  }

  const config = activeJob.brandingConfig;
  if (!config) {
    await failBrandingJob(activeJob.id, BRANDING_FAILURE_CONFIG);
    return;
  }

  const baseAssetId =
    activeJob.preBrandingOutputMediaAssetId ?? activeJob.outputMediaAssetId;
  if (!baseAssetId) {
    await failBrandingJob(activeJob.id, BRANDING_FAILURE_CONFIG);
    return;
  }

  const baseAsset = await loadMediaAssetForBranding(baseAssetId);
  if (!baseAsset || baseAsset.clientId !== activeJob.clientId) {
    await failBrandingJob(activeJob.id, BRANDING_FAILURE_TENANCY_MISMATCH);
    return;
  }

  let logoAsset: Awaited<ReturnType<typeof loadMediaAssetForBranding>> = null;
  const overlayLogo = config.logoEnabled;
  if (overlayLogo) {
    const logoAssetId = await loadClientLogoAssetId(activeJob.clientId);
    if (logoAssetId) {
      logoAsset = await loadMediaAssetForBranding(logoAssetId);
      if (logoAsset && logoAsset.clientId !== activeJob.clientId) {
        await failBrandingJob(activeJob.id, BRANDING_FAILURE_TENANCY_MISMATCH);
        return;
      }
    }
  }

  const burnSubtitles = config.subtitlesEnabled && config.subtitleBeatCount > 0;
  let sanitizedBeats: string[] = [];
  let voiceoverText = "";

  if (burnSubtitles) {
    const script = await loadScriptBrandingContext({
      clientId: activeJob.clientId,
      reelScriptId: activeJob.reelScriptId,
    });
    if (!script) {
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_CONFIG);
      return;
    }

    voiceoverText = script.voiceoverText;

    const sanitized = sanitizeSubtitleBeats(
      resolveSubtitleBeats(script.onScreenText),
    );
    if (!sanitized.ok) {
      await failBrandingJob(activeJob.id, sanitized.messageKey);
      return;
    }

    if (sanitized.subtitleSourceHash !== config.subtitleSourceHash) {
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_SUBTITLE_HASH);
      return;
    }

    // Phase B-M1: re-check voiceoverTimingHash vs live VO before mkdtemp/ASS/spawn.
    // Use raw snapshot field (not soft-defaulted config) so Phase A rows skip.
    const snapshotVoHash = activeJob.rawVoiceoverTimingHash;
    if (
      typeof snapshotVoHash === "string" &&
      VOICEOVER_TIMING_HASH_HEX_RE.test(snapshotVoHash)
    ) {
      const liveHash = computeVoiceoverTimingHash(voiceoverText);
      if (liveHash !== snapshotVoHash) {
        await failBrandingJob(
          activeJob.id,
          BRANDING_FAILURE_VOICEOVER_TIMING_HASH,
        );
        return;
      }
    } else if (
      snapshotVoHash !== undefined &&
      snapshotVoHash !== null &&
      snapshotVoHash !== ""
    ) {
      // Non-empty malformed — fail closed (no soft-skip).
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_CONFIG);
      return;
    }

    sanitizedBeats = sanitized.sanitizedBeats;
  }

  const effectiveBurnSubtitles = burnSubtitles && sanitizedBeats.length > 0;

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), `neuramark-branding-${activeJob.id}-`),
  );
  const basePath = path.join(tempRoot, "base.mp4");
  const brandedPath = path.join(tempRoot, "branded.mp4");
  const coverPath = path.join(tempRoot, "cover.jpg");
  const assPath = path.join(tempRoot, "subtitles.ass");
  let logoPath: string | undefined;

  const ffmpegRunner =
    deps.runFfmpeg ?? ((args: string[]) => runFfmpeg(args));
  const probeFn = deps.probeLocalMediaFile ?? probeLocalMediaFile;

  try {
    const storage = getMediaStorage();
    storage.assertSafeKey(baseAsset.storageKey);
    const baseStream = await storage.readStream(baseAsset.storageKey);
    await writeFile(basePath, await streamToBuffer(baseStream));

    if (overlayLogo && logoAsset) {
      storage.assertSafeKey(logoAsset.storageKey);
      const ext = logoAsset.storageKey.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? "png";
      logoPath = path.join(tempRoot, `logo.${ext}`);
      const logoStream = await storage.readStream(logoAsset.storageKey);
      await writeFile(logoPath, await streamToBuffer(logoStream));
    }

    if (effectiveBurnSubtitles) {
      const beatTimings = computeVoProportionalBeatTimings({
        beatCount: sanitizedBeats.length,
        targetDurationSec: activeJob.targetDurationSec,
        voiceoverText,
      });
      const { assContent } = buildAssFromBeats({
        sanitizedBeats,
        targetDurationSec: activeJob.targetDurationSec,
        outputAssPath: assPath,
        beatTimings,
      });
      await writeFile(assPath, assContent, "utf8");
    }

    const brandingArgs = buildReelV1BrandingArgs({
      localBasePath: basePath,
      localBrandedPath: brandedPath,
      localAssPath: effectiveBurnSubtitles ? assPath : undefined,
      localLogoPath: logoPath,
      burnSubtitles: effectiveBurnSubtitles,
      overlayLogo: overlayLogo && Boolean(logoPath),
    });

    const brandingResult = await ffmpegRunner(brandingArgs);
    if (brandingResult.exitCode !== 0) {
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_FFMPEG);
      return;
    }

    const brandedProbe = await probeFn(brandedPath);
    const durationSec = brandedProbe?.durationSec ?? activeJob.targetDurationSec;
    const clampedCoverSec = clampCoverSeekSec({
      coverFrameSec: config.coverFrameSec,
      durationSec,
    });

    const coverArgs = extractCoverFrameArgs({
      localBrandedPath: brandedPath,
      localCoverPath: coverPath,
      coverFrameSec: clampedCoverSec,
    });

    const coverResult = await ffmpegRunner(coverArgs);
    if (coverResult.exitCode !== 0) {
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_FFMPEG);
      return;
    }

    const brandedBuffer = await readFile(brandedPath);
    const coverBuffer = await readFile(coverPath);
    const brandedStorageKey = generateBrandedReelStorageKey({
      clientId: activeJob.clientId,
      reelScriptId: activeJob.reelScriptId,
    });
    const coverStorageKey = generateCoverFrameStorageKey({
      clientId: activeJob.clientId,
    });

    storage.assertSafeKey(brandedStorageKey);
    storage.assertSafeKey(coverStorageKey);

    await storage.put(brandedStorageKey, brandedBuffer, {
      contentType: "video/mp4",
      sizeBytes: brandedBuffer.length,
    });
    await storage.put(coverStorageKey, coverBuffer, {
      contentType: "image/jpeg",
      sizeBytes: coverBuffer.length,
    });

    const brandedInsert = await insertBrandedReelMediaAsset({
      clientId: activeJob.clientId,
      assemblyJobId: activeJob.id,
      reelScriptId: activeJob.reelScriptId,
      storageKey: brandedStorageKey,
      sizeBytes: brandedBuffer.length,
      durationSec,
    });

    const coverInsert = await insertCoverFrameMediaAsset({
      clientId: activeJob.clientId,
      assemblyJobId: activeJob.id,
      storageKey: coverStorageKey,
      sizeBytes: coverBuffer.length,
    });

    if (!brandedInsert || !coverInsert) {
      await failBrandingJob(activeJob.id, BRANDING_FAILURE_STORAGE);
      return;
    }

    await applyBrandingJobUpdate({
      assemblyJobId: activeJob.id,
      patch: {
        brandingStatus: "completed",
        outputMediaAssetId: brandedInsert.mediaAssetId,
        coverMediaAssetId: coverInsert.mediaAssetId,
      },
      source: "worker",
    });
  } catch (error) {
    console.error("[branding] runBrandingJob failed", {
      assemblyJobId: activeJob.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    await failBrandingJob(activeJob.id, BRANDING_FAILURE_STORAGE);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
