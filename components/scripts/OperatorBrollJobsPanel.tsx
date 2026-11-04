"use client";

import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";

import type {
  OperatorBrollJobClipDto,
  OperatorVideoJobSummaryDto,
} from "@/lib/contracts/video-job";
import { VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT } from "@/lib/contracts/video-job";
import type { VideoJobStatus } from "@/lib/contracts/providers";

export type OperatorBrollJobsCopy = {
  title: string;
  empty: string;
  clipLabel: string;
  polling: string;
  failureReasonLabel: string;
  status: Record<VideoJobStatus, string>;
  providerWan: string;
  providerSeedance: string;
  providerLtx: string;
  providerOther: string;
};

type OperatorBrollJobsPanelProps = {
  initialClips: readonly OperatorBrollJobClipDto[];
  copy: OperatorBrollJobsCopy;
};

function isTerminal(status: VideoJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function statusSeverity(
  status: VideoJobStatus,
): "success" | "info" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "info";
    case "queued":
      return "secondary";
    case "failed":
      return "danger";
    case "cancelled":
      return "warning";
    default:
      return "secondary";
  }
}

function providerLabel(
  providerKey: string,
  copy: OperatorBrollJobsCopy,
): string {
  if (providerKey === "ai_gateway_seedance_broll") {
    return copy.providerSeedance;
  }
  if (providerKey === "siliconflow_wan21_turbo") {
    return copy.providerWan;
  }
  if (providerKey === "ltx_broll_high") {
    return copy.providerLtx;
  }
  return copy.providerOther.replace("{provider}", providerKey);
}

function formatClipLabel(template: string, index: number): string {
  return template.replace("{index}", String(index));
}

export function OperatorBrollJobsPanel({
  initialClips,
  copy,
}: OperatorBrollJobsPanelProps) {
  const [clips, setClips] = useState<OperatorBrollJobClipDto[]>([...initialClips]);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    setClips([...initialClips]);
  }, [initialClips]);

  const activeJobIds = clips
    .filter((clip) => !isTerminal(clip.status))
    .map((clip) => clip.jobId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!activeJobIds) {
      setPolling(false);
      return;
    }

    const activeIds = activeJobIds.split(",");
    let cancelled = false;
    setPolling(true);

    async function tick() {
      const updates = await Promise.all(
        activeIds.map(async (jobId) => {
          try {
            const response = await fetch(`/api/video-jobs/${jobId}`, {
              method: "GET",
              credentials: "same-origin",
              cache: "no-store",
            });
            if (!response.ok) {
              return null;
            }
            return (await response.json()) as OperatorVideoJobSummaryDto;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setClips((prev) =>
        prev.map((clip) => {
          const update = updates.find(
            (item) => item !== null && item.jobId === clip.jobId,
          );
          if (!update) {
            return clip;
          }
          return {
            ...clip,
            status: update.status,
            failureReason: update.failureReason,
            updatedAt: update.updatedAt,
            outputMediaAssetId:
              update.outputMediaAssetId ?? clip.outputMediaAssetId,
          };
        }),
      );
    }

    void tick();
    const handle = window.setInterval(() => {
      void tick();
    }, VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT);

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [activeJobIds]);

  if (clips.length === 0) {
    return (
      <section
        aria-label={copy.title}
        className="mb-3 py-3 px-0 border-t border-edge"
      >
        <h3 className="font-display text-fog mt-0 mx-0 mb-[0.35rem] text-[0.95rem]">{copy.title}</h3>
        <p className="m-0 text-dim text-sm">
          {copy.empty}
        </p>
      </section>
    );
  }

  const completed = clips.filter((c) => c.status === "completed").length;
  const failed = clips.filter((c) => c.status === "failed").length;
  const active = clips.filter((c) => !isTerminal(c.status)).length;

  return (
    <section
      aria-label={copy.title}
      className="mb-3 py-3 px-0 border-t border-edge"
    >
      <div
        className="flex flex-wrap gap-2 items-center mb-2"
      >
        <h3 className="font-display text-fog m-0 text-[0.95rem]">{copy.title}</h3>
        <StatusBadge
          value={`${completed}/${clips.length}`}
          severity={
            failed > 0 ? "danger" : active > 0 ? "info" : "success"
          }
        />
        {polling ? (
          <span className="text-[0.8rem] text-dim">
            {copy.polling}
          </span>
        ) : null}
      </div>

      <ul className="list-none m-0 p-0">
        {clips.map((clip, index) => (
          <li
            key={clip.jobId}
            className="flex flex-col gap-[0.35rem] py-2 px-0 border-b border-edge"
          >
            <div
              className="flex flex-wrap gap-2 items-center"
            >
              <span className="min-w-[4.5rem] text-sm">
                {formatClipLabel(copy.clipLabel, index + 1)}
              </span>
              <StatusBadge
                value={copy.status[clip.status] ?? clip.status}
                severity={statusSeverity(clip.status)}
              />
              <span className="text-[0.8rem] text-dim">
                {providerLabel(clip.providerKey, copy)}
              </span>
            </div>
            {clip.failureReason ? (
              <span className="text-[0.8rem] text-rose">
                {copy.failureReasonLabel}: {clip.failureReason}
              </span>
            ) : null}
            {clip.status === "completed" && clip.outputMediaAssetId ? (
              <video
                controls
                preload="metadata"
                src={`/api/media/assets/${clip.outputMediaAssetId}`}
                className="w-full max-w-[240px] aspect-[16/9] bg-deep rounded-md"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
