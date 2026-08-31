"use client";

import Link from "next/link";
import { Tag } from "primereact/tag";

import { GenericAvatarDisclosurePreview } from "@/components/preferences/GenericAvatarDisclosurePreview";
import { ReadyToPublishDownloadPanel } from "@/components/ready-to-publish/ReadyToPublishDownloadPanel";
import type { ApprovalPackageDto } from "@/lib/contracts/approval";

export type ReadyToPublishDetailCopy = {
  title: string;
  backList: string;
  caption: string;
  selectedCta: string;
  hashtags: string;
  disclosureTitle: string;
  videoLabel: string;
  decidedAt: string;
  approvedStatus: string;
  downloads: {
    title: string;
    subtitle: string;
    downloadVideo: string;
    downloadCaption: string;
    viewDetail: string;
    downloadHint: string;
  };
};

type ReadyToPublishDetailViewProps = {
  pkg: ApprovalPackageDto;
  locale: "en" | "es";
  disclosureLine: string;
  copy: ReadyToPublishDetailCopy;
};

function formatDateTime(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ReadyToPublishDetailView({
  pkg,
  locale,
  disclosureLine,
  copy,
}: ReadyToPublishDetailViewProps) {
  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          href="/ready-to-publish"
          style={{
            color: "#4b5563",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          ← {copy.backList}
        </Link>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.6rem",
            marginTop: "0.75rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>{copy.title}</h1>
          <Tag value={copy.approvedStatus} severity="success" />
        </div>
        {pkg.decidedAt ? (
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            {copy.decidedAt.replace(
              "{date}",
              formatDateTime(pkg.decidedAt, locale),
            )}
          </p>
        ) : null}
      </div>

      <section aria-label={copy.videoLabel} style={{ marginBottom: "1.25rem" }}>
        <video
          key={pkg.video.previewUrl}
          controls
          playsInline
          preload="metadata"
          poster={pkg.cover?.previewUrl}
          src={pkg.video.previewUrl}
          style={{
            width: "100%",
            maxHeight: "70vh",
            background: "#111827",
            borderRadius: "8px",
            display: "block",
          }}
        />
      </section>

      <ReadyToPublishDownloadPanel
        approvalId={pkg.approvalId}
        videoAssetId={pkg.video.assetId}
        showDetailLink={false}
        copy={copy.downloads}
      />

      <section style={{ marginBottom: "1.25rem", marginTop: "1.5rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1rem",
            color: "#374151",
          }}
        >
          {copy.caption}
        </h2>
        <p
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            color: "#111827",
          }}
        >
          {pkg.caption.body}
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1rem",
            color: "#374151",
          }}
        >
          {copy.selectedCta}
        </h2>
        <p style={{ margin: 0, color: "#111827", lineHeight: 1.45 }}>
          {pkg.caption.selectedCtaText}
        </p>
      </section>

      {pkg.hashtags.length > 0 ? (
        <section style={{ marginBottom: "1.25rem" }}>
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1rem",
              color: "#374151",
            }}
          >
            {copy.hashtags}
          </h2>
          <p
            style={{
              margin: 0,
              color: "#4b5563",
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            {pkg.hashtags.join(" ")}
          </p>
        </section>
      ) : null}

      {pkg.disclosure.required ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1rem",
              color: "#374151",
            }}
          >
            {copy.disclosureTitle}
          </h2>
          <GenericAvatarDisclosurePreview
            visible
            variant="approval"
            line={pkg.disclosure.text?.trim() || disclosureLine}
          />
        </div>
      ) : null}
    </div>
  );
}
