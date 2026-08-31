"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { buildReadyToPublishDownloadUrls } from "@/lib/contracts/approval";

export type ReadyToPublishDownloadPanelCopy = {
  title: string;
  subtitle: string;
  downloadVideo: string;
  downloadCaption: string;
  viewDetail: string;
  downloadHint: string;
};

type ReadyToPublishDownloadPanelProps = {
  approvalId: string;
  videoAssetId: string;
  showDetailLink?: boolean;
  copy: ReadyToPublishDownloadPanelCopy;
};

export function ReadyToPublishDownloadPanel({
  approvalId,
  videoAssetId,
  showDetailLink = true,
  copy,
}: ReadyToPublishDownloadPanelProps) {
  const downloads = buildReadyToPublishDownloadUrls({
    approvalId,
    videoAssetId,
  });

  return (
    <section
      aria-label={copy.title}
      style={{
        marginTop: "1.5rem",
        padding: "1rem 1.1rem",
        borderRadius: "8px",
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
      }}
    >
      <h2
        style={{
          margin: "0 0 0.35rem",
          fontSize: "1.05rem",
          color: "#14532d",
        }}
      >
        {copy.title}
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#166534", lineHeight: 1.45 }}>
        {copy.subtitle}
      </p>
      <Message
        severity="info"
        text={copy.downloadHint}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
          alignItems: "center",
        }}
      >
        <a
          href={downloads.videoDownloadUrl}
          download
          style={{ textDecoration: "none" }}
        >
          <Button
            type="button"
            label={copy.downloadVideo}
            icon="pi pi-download"
            style={{ minHeight: "2.75rem" }}
          />
        </a>
        <a
          href={downloads.captionDownloadUrl}
          download
          style={{ textDecoration: "none" }}
        >
          <Button
            type="button"
            label={copy.downloadCaption}
            icon="pi pi-file"
            severity="secondary"
            outlined
            style={{ minHeight: "2.75rem" }}
          />
        </a>
        {showDetailLink ? (
          <Link
            href={`/ready-to-publish/${approvalId}`}
            style={{ textDecoration: "none" }}
          >
            <Button
              type="button"
              label={copy.viewDetail}
              text
              style={{ minHeight: "2.75rem" }}
            />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
