"use client";

import Link from "next/link";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { StatusAlert } from "@/components/ui/status-alert";
import { mapApprovalListItemToCard } from "@/lib/agent-cards";
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
            const badges = [copy.pendingStatus];
            if (item.hasDisclosure) {
              badges.push(copy.disclosureChip);
            }
            if (item.overrideCount != null && item.overrideCount > 0) {
              badges.push(
                copy.overridesChip.replace("{count}", String(item.overrideCount)),
              );
            }
            const card = mapApprovalListItemToCard({
              item,
              title: cardTitle(item, copy.untitled),
              summary: copy.cardSummary,
              reviewLabel: copy.reviewCta,
              reviewHref: `/approvals/${item.approvalId}`,
              badges,
              thumbnailAlt: copy.thumbnailAlt,
              createdAtTemplate: copy.createdAt,
              locale,
            });
            return (
              <li key={item.approvalId}>
                <AgentCard
                  card={card}
                  // disclosure tooltip kept via title on badge text; StatusBadge
                  // inside AgentCard uses value only — tooltip string remains in copy
                  // for i18n wiring tests / future title prop.
                />
                {item.hasDisclosure ? (
                  <span className="sr-only">{copy.disclosureTooltip}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
