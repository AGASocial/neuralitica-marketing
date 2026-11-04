"use client";

import Link from "next/link";

import { DownloadIcon, FileIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";

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
      className="mt-6 py-4 px-[1.1rem] rounded-lg border border-success/40 bg-success/10"
    >
      <h2
        className="font-display text-fog mt-0 mx-0 mb-[0.35rem] text-[1.05rem] text-success"
      >
        {copy.title}
      </h2>
      <p className="mt-0 mx-0 mb-4 text-success leading-[1.45]">
        {copy.subtitle}
      </p>
      <StatusAlert
        severity="info"
        text={copy.downloadHint}
        className="w-full mb-4"
      />
      <div
        className="flex flex-wrap gap-[0.65rem] items-center"
      >
        <a
          href={downloads.videoDownloadUrl}
          download
          className="no-underline"
        >
          <Button
            type="button"
            className="min-h-[2.75rem]"
          >
            <DownloadIcon />
            {copy.downloadVideo}
          </Button>
        </a>
        <a
          href={downloads.captionDownloadUrl}
          download
          className="no-underline"
        >
          <Button
            type="button"
            variant="outline"
            className="min-h-[2.75rem]"
          >
            <FileIcon />
            {copy.downloadCaption}
          </Button>
        </a>
        {showDetailLink ? (
          <Link
            href={`/ready-to-publish/${approvalId}`}
            className="no-underline"
          >
            <Button
              type="button"
              variant="ghost"
              className="min-h-[2.75rem]"
            >
              {copy.viewDetail}
            </Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
