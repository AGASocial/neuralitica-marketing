"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ClientLocalDateTime } from "@/components/i18n/ClientLocalDateTime";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { decideApproval } from "@/lib/approvals/actions/decide-approval";
import type { ApprovedListItemDto } from "@/lib/contracts/approval";
import type {
  MyVideosInProductionItem,
  MyVideosPendingItem,
} from "@/lib/approvals/list-my-videos-hub";
import type { VisualModality } from "@/lib/contracts/visual-preferences";

export type MyVideosHubCopy = {
  title: string;
  subtitle: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  viewCta: string;
  decidedAt: string;
  disclosureChip: string;
  approvedStatus: string;
  sectionInProduction: string;
  sectionPending: string;
  sectionReady: string;
  emptyInProduction: string;
  emptyPending: string;
  emptyReady: string;
  approveCta: string;
  changeCta: string;
  inProductionStatus: string;
  pendingStatus: string;
  progressHint: string;
  untitled: string;
  formatLabels: Record<VisualModality, string>;
};

type MyVideosHubViewProps = {
  inProduction: MyVideosInProductionItem[];
  pending: MyVideosPendingItem[];
  approved: ApprovedListItemDto[];
  loadFailed: boolean;
  locale: "en" | "es";
  copy: MyVideosHubCopy;
};

function pendingTitle(item: MyVideosPendingItem, untitled: string): string {
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

function PendingCard({
  item,
  locale,
  copy,
}: {
  item: MyVideosPendingItem;
  locale: "en" | "es";
  copy: MyVideosHubCopy;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formatLabel = item.formatKey
    ? copy.formatLabels[item.formatKey]
    : null;
  const whenIso = item.assembledAt ?? item.createdAt;

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await decideApproval({
        approvalId: item.approvalId,
        decision: "approved",
      });
      if (!result.ok) {
        setError(copy.loadError);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="border border-edge rounded-lg py-4 px-[1.1rem] bg-panel space-y-3">
      <div className="flex flex-wrap gap-[0.4rem]">
        <StatusBadge value={copy.pendingStatus} severity="warning" />
        {formatLabel ? (
          <StatusBadge value={formatLabel} severity="info" />
        ) : null}
      </div>
      {item.videoPreviewUrl ? (
        <video
          className="w-full max-h-72 rounded-md bg-black"
          controls
          playsInline
          preload="metadata"
          src={item.videoPreviewUrl}
        />
      ) : null}
      <p className="m-0 text-fog font-medium leading-[1.45] break-words">
        {pendingTitle(item, copy.untitled)}
      </p>
      <p className="m-0 text-dim text-sm">
        <ClientLocalDateTime iso={whenIso} locale={locale} />
      </p>
      {error ? <StatusAlert severity="error" text={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
          {copy.approveCta}
        </Button>
        <Button asChild type="button" size="sm" variant="outline">
          <Link href={`/approvals/${item.approvalId}`}>{copy.changeCta}</Link>
        </Button>
      </div>
    </li>
  );
}

export function MyVideosHubView({
  inProduction,
  pending,
  approved,
  loadFailed,
  locale,
  copy,
}: MyVideosHubViewProps) {
  const allEmpty =
    !loadFailed &&
    inProduction.length === 0 &&
    pending.length === 0 &&
    approved.length === 0;

  return (
    <div className="max-w-[720px] my-0 mx-auto space-y-8">
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

      {allEmpty ? (
        <StatusAlert severity="info" text={copy.empty} className="w-full" />
      ) : null}

      {!loadFailed ? (
        <section className="space-y-3" aria-labelledby="my-videos-in-production">
          <h2
            id="my-videos-in-production"
            className="font-display text-xl font-normal text-fog m-0"
          >
            {copy.sectionInProduction}
          </h2>
          {inProduction.length === 0 ? (
            <p className="m-0 text-dim text-sm">{copy.emptyInProduction}</p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {inProduction.map((item) => (
                <li
                  key={`${item.kind}-${item.reelScriptId}-${item.updatedAt}`}
                  className="border border-edge rounded-lg py-4 px-[1.1rem] bg-panel"
                >
                  <StatusBadge
                    value={copy.inProductionStatus}
                    severity="info"
                  />
                  <p className="mt-2 mb-0 text-fog">{copy.progressHint}</p>
                  <p className="m-0 mt-1 text-dim text-sm">
                    <ClientLocalDateTime iso={item.updatedAt} locale={locale} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!loadFailed ? (
        <section className="space-y-3" aria-labelledby="my-videos-pending">
          <h2
            id="my-videos-pending"
            className="font-display text-xl font-normal text-fog m-0"
          >
            {copy.sectionPending}
          </h2>
          {pending.length === 0 ? (
            <p className="m-0 text-dim text-sm">{copy.emptyPending}</p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {pending.map((item) => (
                <PendingCard
                  key={item.approvalId}
                  item={item}
                  locale={locale}
                  copy={copy}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!loadFailed ? (
        <section className="space-y-3" aria-labelledby="my-videos-ready">
          <h2
            id="my-videos-ready"
            className="font-display text-xl font-normal text-fog m-0"
          >
            {copy.sectionReady}
          </h2>
          {approved.length === 0 ? (
            <p className="m-0 text-dim text-sm">{copy.emptyReady}</p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {approved.map((item) => (
                <li
                  key={item.approvalId}
                  className="border border-edge rounded-lg py-4 px-[1.1rem] bg-panel"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-[1_1_200px] min-w-0">
                      <div className="flex flex-wrap gap-[0.4rem] mb-2">
                        <StatusBadge
                          value={copy.approvedStatus}
                          severity="success"
                        />
                        {item.hasDisclosure ? (
                          <StatusBadge
                            value={copy.disclosureChip}
                            severity="info"
                          />
                        ) : null}
                      </div>
                      <p className="mt-0 mx-0 mb-[0.35rem] text-fog leading-[1.45] break-words">
                        {item.captionPreview?.trim()
                          ? item.captionPreview
                          : copy.untitled}
                      </p>
                      <p className="m-0 text-dim text-sm">
                        <ClientLocalDateTime
                          iso={item.decidedAt}
                          locale={locale}
                          template={copy.decidedAt}
                        />
                      </p>
                    </div>
                    <Link
                      href={`/ready-to-publish/${item.approvalId}`}
                      className="no-underline shrink-0"
                    >
                      <Button type="button" size="sm">
                        {copy.viewCta}
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
