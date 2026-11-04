"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";

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
    <div className="max-w-[640px] my-0 mx-auto">
      <div className="mb-5">
        <Link
          href="/ready-to-publish"
          className="text-dim no-underline text-[0.9rem]"
        >
          ← {copy.backList}
        </Link>
        <div
          className="flex flex-wrap items-center gap-[0.6rem] mt-3"
        >
          <h1 className="font-display text-fog m-0 text-[1.75rem]">{copy.title}</h1>
          <StatusBadge value={copy.approvedStatus} severity="success" />
        </div>
        {pkg.decidedAt ? (
          <p className="mt-2 mx-0 mb-0 text-dim text-sm">
            {copy.decidedAt.replace(
              "{date}",
              formatDateTime(pkg.decidedAt, locale),
            )}
          </p>
        ) : null}
      </div>

      <section aria-label={copy.videoLabel} className="mb-5">
        <video
          key={pkg.video.previewUrl}
          controls
          playsInline
          preload="metadata"
          poster={pkg.cover?.previewUrl}
          src={pkg.video.previewUrl}
          className="w-full max-h-[70vh] bg-deep rounded-lg block"
        />
      </section>

      <ReadyToPublishDownloadPanel
        approvalId={pkg.approvalId}
        videoAssetId={pkg.video.assetId}
        showDetailLink={false}
        copy={copy.downloads}
      />

      <section className="mb-5 mt-6">
        <h2
          className="font-display mt-0 mx-0 mb-2 text-base text-fog"
        >
          {copy.caption}
        </h2>
        <p
          className="m-0 whitespace-pre-wrap leading-[1.5] text-fog"
        >
          {pkg.caption.body}
        </p>
      </section>

      <section className="mb-5">
        <h2
          className="font-display mt-0 mx-0 mb-2 text-base text-fog"
        >
          {copy.selectedCta}
        </h2>
        <p className="m-0 text-fog leading-[1.45]">
          {pkg.caption.selectedCtaText}
        </p>
      </section>

      {pkg.hashtags.length > 0 ? (
        <section className="mb-5">
          <h2
            className="font-display mt-0 mx-0 mb-2 text-base text-fog"
          >
            {copy.hashtags}
          </h2>
          <p
            className="m-0 text-dim leading-[1.45] break-words"
          >
            {pkg.hashtags.join(" ")}
          </p>
        </section>
      ) : null}

      {pkg.disclosure.required ? (
        <div className="mb-5">
          <h2
            className="font-display mt-0 mx-0 mb-2 text-base text-fog"
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
