"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type CampanaReelBadge =
  | "published"
  | "scheduled"
  | "review"
  | "rendering"
  | "draft"
  | "planned";

export type CampanaReelCardModel = {
  id: string;
  title: string;
  subtitle?: string;
  badge: CampanaReelBadge;
  badgeLabel: string;
  thumbnailUrl?: string | null;
  href?: string;
  renderingProgressLabel?: string;
};

type ReelCardCopy = {
  newReel: string;
  newReelHint: string;
  rendering: string;
};

type ReelCardProps = {
  reel: CampanaReelCardModel;
  onSelect?: () => void;
};

type NewReelCardProps = {
  copy: ReelCardCopy;
  href: string;
};

const badgeClass: Record<CampanaReelBadge, string> = {
  published: "bg-butter text-deep",
  scheduled: "bg-fog text-deep",
  review: "bg-rose text-deep",
  rendering: "bg-panel text-butter border border-butter/40",
  draft: "bg-panel text-dim border border-edge",
  planned: "bg-deep text-dim border border-edge",
};

export function ReelCard({ reel, onSelect }: ReelCardProps) {
  const content = (
    <>
      {reel.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={reel.thumbnailUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-panel to-deep" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/20 to-transparent" />
      <span
        className={cn(
          "absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-bold",
          badgeClass[reel.badge],
        )}
      >
        {reel.badgeLabel}
      </span>
      {reel.badge === "rendering" ? (
        <div className="absolute inset-0 grid place-items-center bg-deep/50">
          <div className="text-center">
            <Loader2
              className="mx-auto size-10 animate-spin text-butter motion-reduce:animate-none"
              aria-hidden
            />
            <p className="mt-3 text-sm font-semibold">{reel.badgeLabel}</p>
            {reel.renderingProgressLabel ? (
              <p className="mt-1 text-xs text-dim">{reel.renderingProgressLabel}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-3 bottom-3">
          <p className="text-sm font-bold leading-tight text-fog">{reel.title}</p>
          {reel.subtitle ? (
            <p className="mt-1 text-xs text-dim">{reel.subtitle}</p>
          ) : null}
        </div>
      )}
    </>
  );

  const className =
    "reel relative aspect-[9/16] w-full overflow-hidden rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butter";

  if (reel.href) {
    return (
      <Link href={reel.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onSelect}>
      {content}
    </button>
  );
}

export function NewReelCard({ copy, href }: NewReelCardProps) {
  return (
    <Link
      href={href}
      className="reel grid aspect-[9/16] place-items-center rounded-2xl bg-panel text-center transition-colors hover:bg-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butter"
    >
      <div>
        <Plus className="mx-auto size-10 text-butter" aria-hidden />
        <p className="mt-1 text-sm font-semibold">{copy.newReel}</p>
        <p className="px-4 text-xs text-dim">{copy.newReelHint}</p>
      </div>
    </Link>
  );
}
