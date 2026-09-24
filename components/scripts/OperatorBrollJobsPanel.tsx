"use client";

import { useEffect, useState } from "react";
import { Tag } from "primereact/tag";

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
        style={{
          marginBottom: "0.75rem",
          padding: "0.75rem 0",
          borderTop: "1px solid var(--surface-border)",
        }}
      >
        <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>{copy.title}</h3>
        <p style={{ margin: 0, color: "var(--text-color-secondary)", fontSize: "0.875rem" }}>
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
      style={{
        marginBottom: "0.75rem",
        padding: "0.75rem 0",
        borderTop: "1px solid var(--surface-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>{copy.title}</h3>
        <Tag
          value={`${completed}/${clips.length}`}
          severity={
            failed > 0 ? "danger" : active > 0 ? "info" : "success"
          }
        />
        {polling ? (
          <span style={{ fontSize: "0.8rem", color: "var(--text-color-secondary)" }}>
            {copy.polling}
          </span>
        ) : null}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {clips.map((clip, index) => (
          <li
            key={clip.jobId}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              padding: "0.5rem 0",
              borderBottom: "1px solid var(--surface-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              <span style={{ minWidth: "4.5rem", fontSize: "0.875rem" }}>
                {formatClipLabel(copy.clipLabel, index + 1)}
              </span>
              <Tag
                value={copy.status[clip.status] ?? clip.status}
                severity={statusSeverity(clip.status)}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-color-secondary)" }}>
                {providerLabel(clip.providerKey, copy)}
              </span>
            </div>
            {clip.failureReason ? (
              <span style={{ fontSize: "0.8rem", color: "var(--red-500)" }}>
                {copy.failureReasonLabel}: {clip.failureReason}
              </span>
            ) : null}
            {clip.status === "completed" && clip.outputMediaAssetId ? (
              <video
                controls
                preload="metadata"
                src={`/api/media/assets/${clip.outputMediaAssetId}`}
                style={{
                  width: "100%",
                  maxWidth: "240px",
                  aspectRatio: "16 / 9",
                  background: "#111827",
                  borderRadius: "0.375rem",
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
