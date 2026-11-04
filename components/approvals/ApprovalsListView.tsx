"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";

import type { ApprovalListItemDto } from "@/lib/contracts/approval";

export type ApprovalsListCopy = {
  title: string;
  subtitle: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  reviewCta: string;
  createdAt: string;
  disclosureChip: string;
  overridesChip: string;
  pendingStatus: string;
};

type ApprovalsListViewProps = {
  items: ApprovalListItemDto[];
  loadFailed: boolean;
  locale: "en" | "es";
  copy: ApprovalsListCopy;
};

function formatCreatedAt(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
        <ul
          className="list-none m-0 p-0 flex flex-col gap-3"
        >
          {items.map((item) => (
            <li
              key={item.approvalId}
              className="border border-edge rounded-lg py-4 px-[1.1rem] bg-panel"
            >
              <div
                className="flex flex-wrap items-start justify-between gap-3"
              >
                <div className="flex-[1_1_200px] min-w-0">
                  <div
                    className="flex flex-wrap gap-[0.4rem] mb-2"
                  >
                    <StatusBadge value={copy.pendingStatus} severity="warning" />
                    {item.hasDisclosure ? (
                      <StatusBadge value={copy.disclosureChip} severity="info" />
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
                  <p
                    className="mt-0 mx-0 mb-[0.35rem] text-fog leading-[1.45] break-words"
                  >
                    {item.captionPreview?.trim()
                      ? item.captionPreview
                      : "—"}
                  </p>
                  <p className="m-0 text-dim text-sm">
                    {copy.createdAt.replace(
                      "{date}",
                      formatCreatedAt(item.createdAt, locale),
                    )}
                  </p>
                </div>
                <Link
                  href={`/approvals/${item.approvalId}`}
                  className="no-underline shrink-0"
                >
                  <Button
                    type="button"
                    size="sm"
                  >
                    {copy.reviewCta}
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
