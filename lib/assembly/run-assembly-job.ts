import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { roundDurationSecDown } from "@/lib/media/probe-video-duration";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";

import { applyAssemblyJobUpdate } from "./apply-assembly-job-update";
import { getAssemblyDurationToleranceSec } from "./assembly-job-config";
import { isTerminalAssemblyJobStatus } from "./assembly-job-row";
import { buildReelV1BasicArgs } from "./ffmpeg/build-reel-v1-basic-args";
import { generateAssembledReelStorageKey } from "./generate-assembled-reel-storage-key";
import { insertAssembledReelMediaAsset } from "./insert-assembled-reel-media-asset";
import { loadAssemblyJobByIdUnscoped } from "./load-assembly-job";
import {
  loadMediaAssetForAssembly,
  voiceoverExtensionFromStorageKey,
} from "./load-media-asset-for-assembly";
import { probeLocalMediaFile } from "./probe-media-streams";
import { runFfmpeg, type RunFfmpegOptions } from "./run-ffmpeg";

export const ASSEMBLY_FAILURE_TENANCY_MISMATCH =
  "scripts.assembly.failure.tenancyMismatch" as const;
export const ASSEMBLY_FAILURE_MISSING_AUDIO =
  "scripts.assembly.failure.missingAudio" as const;
export const ASSEMBLY_FAILURE_FFMPEG =
  "scripts.assembly.failure.ffmpegError" as const;
export const ASSEMBLY_FAILURE_PROBE =
  "scripts.assembly.failure.probeError" as const;
export const ASSEMBLY_FAILURE_DURATION =
  "scripts.assembly.failure.durationOutOfTolerance" as const;
export const ASSEMBLY_FAILURE_STORAGE =
  "scripts.assembly.failure.storageError" as const;

export type RunAssemblyJobDeps = {
  runFfmpeg?: (args: string[]) => Promise<{ exitCode: number; stderr: string }>;
  probeLocalMediaFile?: (
    filePath: string,
  ) => Promise<{ durationSec: number; hasAudioStream: boolean } | null>;
};

async function failAssemblyJob(
  assemblyJobId: string,
  failureReason: string,
): Promise<void> {
  await applyAssemblyJobUpdate({
    assemblyJobId,
    patch: { status: "failed", failureReason },
    source: "worker",
  });
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/**
 * Fly worker + dev in-process assembly runner (US-9.1 Phase A).
 * Downloads owned assets via Storage SDK, probes audio, spawns ffmpeg, uploads output.
 */
export async function runAssemblyJob(
  assemblyJobId: string,
  deps: RunAssemblyJobDeps = {},
): Promise<void> {
  const job = await loadAssemblyJobByIdUnscoped(assemblyJobId);
  if (!job || isTerminalAssemblyJobStatus(job.status)) {
    return;
  }

  if (job.status === "queued") {
    await applyAssemblyJobUpdate({
      assemblyJobId: job.id,
      patch: { status: "processing" },
      source: "worker",
    });
  }

  const activeJob = await loadAssemblyJobByIdUnscoped(assemblyJobId);
  if (!activeJob || isTerminalAssemblyJobStatus(activeJob.status)) {
    return;
  }

  const primaryAsset = await loadMediaAssetForAssembly(
    activeJob.primaryVideoAssetId,
  );
  const voiceoverAsset = activeJob.voiceoverAssetId
    ? await loadMediaAssetForAssembly(activeJob.voiceoverAssetId)
    : null;

  if (
    !primaryAsset ||
    primaryAsset.clientId !== activeJob.clientId ||
    (voiceoverAsset && voiceoverAsset.clientId !== activeJob.clientId)
  ) {
    await failAssemblyJob(
      activeJob.id,
      ASSEMBLY_FAILURE_TENANCY_MISMATCH,
    );
    return;
  }

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), `neuramark-assembly-${activeJob.id}-`),
  );
  const primaryPath = path.join(tempRoot, "primary.mp4");
  const outputPath = path.join(tempRoot, "output.mp4");
  let voiceoverPath: string | undefined;

  const probeFn = deps.probeLocalMediaFile ?? probeLocalMediaFile;
  const ffmpegRunner =
    deps.runFfmpeg ?? ((args: string[]) => runFfmpeg(args));

  try {
    const storage = getMediaStorage();
    storage.assertSafeKey(primaryAsset.storageKey);
    const primaryStream = await storage.readStream(primaryAsset.storageKey);
    await writeFile(primaryPath, await streamToBuffer(primaryStream));

    const primaryProbe = await probeFn(primaryPath);
    if (!primaryProbe) {
      await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_PROBE);
      return;
    }

    const remuxVoiceover = !primaryProbe.hasAudioStream;
    if (remuxVoiceover) {
      if (!voiceoverAsset) {
        await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_MISSING_AUDIO);
        return;
      }

      storage.assertSafeKey(voiceoverAsset.storageKey);
      const ext = voiceoverExtensionFromStorageKey(voiceoverAsset.storageKey);
      voiceoverPath = path.join(tempRoot, `voiceover.${ext}`);
      const voiceoverStream = await storage.readStream(
        voiceoverAsset.storageKey,
      );
      await writeFile(voiceoverPath, await streamToBuffer(voiceoverStream));
    }

    const toleranceSec = getAssemblyDurationToleranceSec();
    const ffmpegArgs = buildReelV1BasicArgs({
      localPrimaryPath: primaryPath,
      localOutputPath: outputPath,
      localVoiceoverPath: voiceoverPath,
      remuxVoiceover,
      primaryDurationSec: primaryProbe.durationSec,
      targetDurationSec: activeJob.targetDurationSec,
      toleranceSec,
    });

    const ffmpegResult = await ffmpegRunner(ffmpegArgs);
    if (ffmpegResult.exitCode !== 0) {
      await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_FFMPEG);
      return;
    }

    const outputProbe = await probeFn(outputPath);
    if (!outputProbe) {
      await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_PROBE);
      return;
    }

    const actualDurationSec = roundDurationSecDown(outputProbe.durationSec);
    if (
      Math.abs(actualDurationSec - activeJob.targetDurationSec) > toleranceSec
    ) {
      await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_DURATION);
      return;
    }

    const outputBuffer = await readFile(outputPath);
    const storageKey = generateAssembledReelStorageKey({
      clientId: activeJob.clientId,
      reelScriptId: activeJob.reelScriptId,
    });

    storage.assertSafeKey(storageKey);
    await storage.put(storageKey, outputBuffer, {
      contentType: "video/mp4",
      sizeBytes: outputBuffer.length,
    });

    const inserted = await insertAssembledReelMediaAsset({
      clientId: activeJob.clientId,
      assemblyJobId: activeJob.id,
      storageKey,
      sizeBytes: outputBuffer.length,
      durationSec: actualDurationSec,
    });

    if (!inserted) {
      await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_STORAGE);
      return;
    }

    await applyAssemblyJobUpdate({
      assemblyJobId: activeJob.id,
      patch: {
        status: "completed",
        outputMediaAssetId: inserted.mediaAssetId,
        actualDurationSec,
      },
      source: "worker",
    });
  } catch (error) {
    console.error("[assembly] runAssemblyJob failed", {
      assemblyJobId: activeJob.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    await failAssemblyJob(activeJob.id, ASSEMBLY_FAILURE_STORAGE);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export type { RunFfmpegOptions };
