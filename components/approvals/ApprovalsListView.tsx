"use client";

import Link from "next/link";

import { ClientLocalDateTime } from "@/components/i18n/ClientLocalDateTime";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";
import type { ApprovalListItemDto } from "@/lib/contracts/approval";

export type ApprovalsListCopy = {
  title: string;
  subtitle: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  reviewCta: string;
  createdAt: string;
  cardSummary: string;
  untitled: string;
  disclosureChip: string;
  disclosureTooltip: string;
  overridesChip: string;
  pendingStatus: string;
  thumbnailAlt: string;
};

type ApprovalsListViewProps = {
  items: ApprovalListItemDto[];
  loadFailed: boolean;
  locale: "en" | "es";
  copy: ApprovalsListCopy;
};

function cardTitle(item: ApprovalListItemDto, untitled: string): string {
  const title = item.title?.trim();
  if (title) {
    return title;
  }
  const caption = item.captionPreview?.trim();
  if (caption) {
    return caption;
  }
  return untitled;
}

export function ApprovalsListView({
  items,
  loadFailed,
  locale,
  copy,
}: ApprovalsListViewProps) {
  return (
    <div className="max-w-[720px] my-0 mx-auto">
      <div className="mb-5">
        <Link
          href="/dashboard"
          className="text-dim no-underline text-[0.9rem]"
        >
          ← {copy.backDashboard}
        </Link>
        <h1 className="font-display text-fog mt-3 mx-0 mb-[0.35rem] text-[1.75rem]">
          {copy.title}
        </h1>
        <p className="m-0 text-dim">{copy.subtitle}</p>
      </div>

      {loadFailed ? (
        <StatusAlert severity="error" text={copy.loadError} className="w-full" />
      ) : null}

      {!loadFailed && items.length === 0 ? (
        <StatusAlert severity="info" text={copy.empty} className="w-full" />
      ) : null}

      {!loadFailed && items.length > 0 ? (
        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {items.map((item) => {
            const previewSrc = item.videoAssetId
              ? mediaPreviewUrl(item.videoAssetId)
              : null;
            return (
              <li
                key={item.approvalId}
                className="border border-edge rounded-lg py-4 px-[1.1rem] bg-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-[1_1_220px] min-w-0 gap-3">
                    {previewSrc ? (
                      <MediaThumbnail
                        src={previewSrc}
                        kind="video"
                        alt={copy.thumbnailAlt}
                        className="size-16 shrink-0 rounded-md"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-[0.4rem] mb-2">
                        <StatusBadge
                          value={copy.pendingStatus}
                          severity="warning"
                        />
                        {item.hasDisclosure ? (
                          <StatusBadge
                            value={copy.disclosureChip}
                            severity="info"
                            title={copy.disclosureTooltip}
                          />
                        ) : null}
                        {item.overrideCount != null && item.overrideCount > 0 ? (
                          <StatusBadge
                            value={copy.overridesChip.replace(
                              "{count}",
                              String(item.overrideCount),
                            )}
                            severity="secondary"
                          />
                        ) : null}
                      </div>
                      <p className="mt-0 mx-0 mb-[0.35rem] text-fog font-medium leading-[1.45] break-words">
                        {cardTitle(item, copy.untitled)}
                      </p>
                      <p className="mt-0 mx-0 mb-[0.35rem] text-dim text-sm leading-[1.45]">
                        {copy.cardSummary}
                      </p>
                      <p className="m-0 text-dim text-sm">
                        <ClientLocalDateTime
                          iso={item.createdAt}
                          locale={locale}
                          template={copy.createdAt}
                        />
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/approvals/${item.approvalId}`}
                    className="no-underline shrink-0"
                  >
                    <Button type="button" size="sm">
                      {copy.reviewCta}
                    </Button>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
