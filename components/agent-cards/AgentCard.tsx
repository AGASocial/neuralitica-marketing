"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ClientLocalDateTime } from "@/components/i18n/ClientLocalDateTime";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AgentCardAction,
  AgentCardData,
} from "@/lib/agent-cards";
import { cn } from "@/lib/utils";

export type AgentCardActionEvent = {
  id: string;
  card: AgentCardData;
  meta?: Record<string, unknown>;
};

export type AgentCardProps = {
  card: AgentCardData;
  onAction?: (event: AgentCardActionEvent) => void;
  disabled?: boolean;
  className?: string;
  /** Optional status line under the body (success / error from controller). */
  statusNote?: ReactNode;
  /** Hide footer actions (e.g. after approve succeeded). */
  hideActions?: boolean;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ActionButtons({
  actions,
  disabled,
  onAction,
  card,
}: {
  actions: AgentCardAction[];
  disabled?: boolean;
  onAction?: (event: AgentCardActionEvent) => void;
  card: AgentCardData;
}) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const isPrimary = action.role === "primary";
        if (action.href) {
          return (
            <Button
              key={action.id}
              asChild
              type="button"
              size="sm"
              variant={isPrimary ? "default" : "outline"}
              className={
                isPrimary
                  ? "bg-butter text-deep hover:bg-butter/90"
                  : "border-edge"
              }
              disabled={disabled}
            >
              <Link
                href={action.href}
                onClick={() =>
                  onAction?.({ id: action.id, card, meta: { href: action.href } })
                }
              >
                {action.label}
              </Link>
            </Button>
          );
        }
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={isPrimary ? "default" : "ghost"}
            className={
              isPrimary
                ? "bg-butter text-deep hover:bg-butter/90"
                : "text-dim"
            }
            disabled={disabled}
            onClick={() => onAction?.({ id: action.id, card })}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function SpendNote({
  cents,
  hintTemplate,
  unknownLabel,
}: {
  cents: number | null | undefined;
  hintTemplate?: string;
  unknownLabel?: string;
}) {
  if (cents != null && hintTemplate) {
    return (
      <p className="text-butter">
        {hintTemplate.replace("{amount}", formatCents(cents))}
      </p>
    );
  }
  if (unknownLabel) {
    return <p className="text-butter">{unknownLabel}</p>;
  }
  return null;
}

export function AgentCard({
  card,
  onAction,
  disabled,
  className,
  statusNote,
  hideActions,
}: AgentCardProps) {
  if (card.type === "next_step_chips") {
    return (
      <ul
        className={cn(
          "m-0 flex list-none flex-wrap gap-2 overflow-x-auto p-0",
          className,
        )}
        aria-label={card.props.ariaLabel}
      >
        {card.props.chips.map((chip) => (
          <li key={chip.id} className="max-w-full shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 max-w-full border-edge px-3 text-fog"
              disabled={disabled}
              onClick={() =>
                onAction?.({
                  id: `chip:${chip.id}`,
                  card,
                  meta: { text: chip.text, chipId: chip.id },
                })
              }
            >
              <span className="truncate">{chip.text}</span>
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  if (card.type === "clarifying_question") {
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="gap-1 px-4 pb-0 pt-4">
          <CardTitle className="font-display text-lg text-fog">
            {card.title}
          </CardTitle>
          <CardDescription className="text-dim">{card.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3 text-sm">
          <p className="text-fog/90">{card.props.question}</p>
          {card.props.helper ? (
            <p className="text-dim">{card.props.helper}</p>
          ) : null}
          {card.props.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {card.props.options.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 border-edge"
                  disabled={disabled}
                  onClick={() =>
                    onAction?.({
                      id: `option:${option.id}`,
                      card,
                      meta: { optionId: option.id, label: option.label },
                    })
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          {statusNote}
        </CardContent>
        {!hideActions && card.actions.length > 0 ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (card.type === "reel_approval") {
    const props = card.props;
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="gap-1 px-4 pb-0 pt-4">
          {props.badges?.length ? (
            <div className="mb-1 flex flex-wrap gap-[0.4rem]">
              {props.badges.map((badge) => (
                <StatusBadge key={badge} value={badge} severity="warning" />
              ))}
            </div>
          ) : null}
          <CardTitle className="font-display text-lg text-fog">
            {card.title}
          </CardTitle>
          {card.summary ? (
            <CardDescription className="text-dim">{card.summary}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3">
          {props.previewMode === "player" && props.videoPreviewUrl ? (
            <video
              key={props.videoPreviewUrl}
              controls
              playsInline
              preload="metadata"
              poster={props.coverPreviewUrl}
              src={props.videoPreviewUrl}
              className="max-h-72 w-full rounded-md bg-deep"
            />
          ) : props.videoPreviewUrl ? (
            <MediaThumbnail
              src={props.videoPreviewUrl}
              posterSrc={props.coverPreviewUrl}
              kind="video"
              alt={props.thumbnailAlt ?? ""}
              className="size-16 shrink-0 rounded-md"
            />
          ) : null}
          {props.captionPreview ? (
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-fog/90">
              {props.captionPreview}
            </p>
          ) : null}
          {props.createdAtIso && props.locale ? (
            <p className="m-0 text-sm text-dim">
              <ClientLocalDateTime
                iso={props.createdAtIso}
                locale={props.locale}
                template={props.createdAtTemplate}
              />
            </p>
          ) : null}
          {statusNote}
        </CardContent>
        {!hideActions && card.actions.length > 0 ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (card.type === "voice_cost") {
    return (
      <VoiceCostCardBody
        card={card}
        onAction={onAction}
        disabled={disabled}
        className={className}
        statusNote={statusNote}
        hideActions={hideActions}
      />
    );
  }

  if (card.type === "cost_confirmation") {
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="gap-1 px-4 pb-0 pt-4">
          <CardTitle className="font-display text-lg text-fog">
            {card.title}
          </CardTitle>
          <CardDescription className="text-dim">{card.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
          {card.props.tema ? (
            <p className="text-fog/90">{card.props.tema}</p>
          ) : null}
          {card.props.styleLabel ? <p>{card.props.styleLabel}</p> : null}
          <SpendNote
            cents={card.props.estimatedCostCents}
            hintTemplate={card.props.spendHintTemplate}
            unknownLabel={card.props.spendUnknownLabel}
          />
          {statusNote}
        </CardContent>
        {!hideActions ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (card.type === "script_approval") {
    const p = card.props;
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="gap-1 px-4 pb-0 pt-4">
          <CardTitle className="font-display text-lg text-fog">
            {card.title}
          </CardTitle>
          <CardDescription className="text-dim">
            {p.tema ?? card.summary}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3 text-sm">
          {card.summary && p.tema ? (
            <p className="text-dim">{card.summary}</p>
          ) : null}
          {p.changeSummary ? (
            <p className="text-fog/90">{p.changeSummary}</p>
          ) : null}
          {p.status === "pending" ? (
            <p className="text-dim">{p.pendingLabel}</p>
          ) : (
            <>
              {p.hook ? (
                <div className="space-y-1">
                  {p.hookLabel ? (
                    <p className="text-dim">{p.hookLabel}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-fog/90">{p.hook}</p>
                </div>
              ) : null}
              {p.body ? (
                <div className="space-y-1">
                  {p.bodyLabel ? (
                    <p className="text-dim">{p.bodyLabel}</p>
                  ) : null}
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-fog/90">
                    {p.body}
                  </p>
                </div>
              ) : null}
              {p.cta ? (
                <div className="space-y-1">
                  {p.ctaLabel ? <p className="text-dim">{p.ctaLabel}</p> : null}
                  <p className="whitespace-pre-wrap text-fog/90">{p.cta}</p>
                </div>
              ) : null}
            </>
          )}
          {statusNote}
        </CardContent>
        {!hideActions ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (card.type === "progress") {
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="gap-1 px-4 pb-0 pt-4">
          <CardTitle className="font-display text-lg text-fog">
            {card.title}
          </CardTitle>
          {card.summary || card.props.nextStepHint ? (
            <CardDescription className="text-dim">
              {card.summary ?? card.props.nextStepHint}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3 text-sm">
          <ol className="space-y-1.5">
            {card.props.steps.map((step) => (
              <li
                key={step.key}
                className={
                  step.status === "current"
                    ? "text-butter"
                    : step.status === "done"
                      ? "text-fog/80"
                      : "text-dim"
                }
              >
                {step.label} — {step.statusLabel}
              </li>
            ))}
          </ol>
          {statusNote}
        </CardContent>
        {!hideActions && card.actions.length > 0 ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (card.type === "status_summary") {
    return (
      <Card
        className={cn("border-edge bg-panel text-fog shadow-none", className)}
      >
        <CardHeader className="px-4 pb-0 pt-4">
          <CardTitle className="font-display text-lg">{card.title}</CardTitle>
          {card.summary ? (
            <CardDescription className="text-dim">{card.summary}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1 px-4 py-3 text-sm text-dim">
          {card.props.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {card.props.listItems && card.props.listItems.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4">
              {card.props.listItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {statusNote}
        </CardContent>
        {!hideActions && card.actions.length > 0 ? (
          <CardFooter className="px-4 pb-4">
            <ActionButtons
              actions={card.actions}
              disabled={disabled}
              onAction={onAction}
              card={card}
            />
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  // plan_approval | own_avatar_activation
  return (
    <Card
      className={cn("border-edge bg-panel text-fog shadow-none", className)}
    >
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">
          {card.title}
        </CardTitle>
        <CardDescription className="text-dim">{card.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
        {card.type === "plan_approval" && card.props.themes?.length ? (
          <p>{card.props.themes.join(" · ")}</p>
        ) : null}
        {card.type === "own_avatar_activation" && card.props.detail ? (
          <p className="text-fog/90">{card.props.detail}</p>
        ) : null}
        {card.type === "plan_approval" && card.props.incursSpend ? (
          <SpendNote
            cents={card.props.estimatedCostCents}
            hintTemplate={card.props.spendHintTemplate}
            unknownLabel={card.props.spendUnknownLabel}
          />
        ) : null}
        {statusNote}
      </CardContent>
      {!hideActions ? (
        <CardFooter className="px-4 pb-4">
          <ActionButtons
            actions={card.actions}
            disabled={disabled}
            onAction={onAction}
            card={card}
          />
        </CardFooter>
      ) : null}
    </Card>
  );
}

function VoiceCostCardBody({
  card,
  onAction,
  disabled,
  className,
  statusNote,
  hideActions,
}: {
  card: Extract<AgentCardData, { type: "voice_cost" }>;
  onAction?: (event: AgentCardActionEvent) => void;
  disabled?: boolean;
  className?: string;
  statusNote?: ReactNode;
  hideActions?: boolean;
}) {
  const initial =
    card.props.eligibleVideos.find(
      (v) => v.reelScriptId === card.props.reelScriptId,
    ) ??
    card.props.eligibleVideos[0] ?? {
      reelScriptId: card.props.reelScriptId,
      slotIndex: card.props.slotIndex,
      tema: card.props.tema ?? "",
      estimatedCostCents: card.props.estimatedCostCents,
      confirmEstimateCents: card.props.confirmEstimateCents,
      charCount: 0,
    };
  const [selection, setSelection] = useState(initial);
  const optionTemplate = card.props.videoOptionTemplate ?? "{n}. {tema}";

  return (
    <Card
      className={cn("border-edge bg-panel text-fog shadow-none", className)}
    >
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">
          {card.title}
        </CardTitle>
        <CardDescription className="text-dim">{card.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
        {(selection.tema || card.props.tema) && (
          <p className="text-fog/90">{selection.tema || card.props.tema}</p>
        )}
        {card.props.styleLabel ? <p>{card.props.styleLabel}</p> : null}
        {card.props.eligibleVideos.length > 1 ? (
          <div className="space-y-2">
            {card.props.pickVideoLabel ? (
              <p className="text-xs text-dim">{card.props.pickVideoLabel}</p>
            ) : null}
            <div
              className="hidden flex-wrap gap-2 sm:flex"
              role="group"
              aria-label={card.props.pickVideoLabel}
            >
              {card.props.eligibleVideos.map((video) => {
                const selected = selection.reelScriptId === video.reelScriptId;
                const label = optionTemplate
                  .replace("{n}", String(video.slotIndex + 1))
                  .replace("{tema}", video.tema);
                return (
                  <Button
                    key={video.reelScriptId}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "bg-butter text-deep hover:bg-butter/90"
                        : "border-edge bg-panel text-fog hover:bg-panel/80"
                    }
                    onClick={() => setSelection(video)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            <label className="block sm:hidden">
              <span className="sr-only">{card.props.pickVideoLabel}</span>
              <select
                className="w-full rounded-md border border-edge bg-deep px-2 py-2 text-sm text-fog"
                disabled={disabled}
                value={selection.reelScriptId}
                onChange={(event) => {
                  const next = card.props.eligibleVideos.find(
                    (v) => v.reelScriptId === event.target.value,
                  );
                  if (next) {
                    setSelection(next);
                  }
                }}
              >
                {card.props.eligibleVideos.map((video) => (
                  <option key={video.reelScriptId} value={video.reelScriptId}>
                    {optionTemplate
                      .replace("{n}", String(video.slotIndex + 1))
                      .replace("{tema}", video.tema)}
                    {` · ${formatCents(video.estimatedCostCents)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <SpendNote
          cents={selection.estimatedCostCents}
          hintTemplate={card.props.spendHintTemplate}
        />
        {statusNote}
      </CardContent>
      {!hideActions ? (
        <CardFooter className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {card.actions.map((action) => {
              const isPrimary = action.role === "primary";
              return (
                <Button
                  key={action.id}
                  type="button"
                  size="sm"
                  variant={isPrimary ? "default" : "ghost"}
                  className={
                    isPrimary
                      ? "bg-butter text-deep hover:bg-butter/90"
                      : "text-dim"
                  }
                  disabled={disabled}
                  onClick={() =>
                    onAction?.({
                      id: action.id,
                      card,
                      meta:
                        action.id === "approve"
                          ? {
                              reelScriptId: selection.reelScriptId,
                              confirmEstimateCents:
                                selection.confirmEstimateCents,
                              estimatedCostCents: selection.estimatedCostCents,
                            }
                          : undefined,
                    })
                  }
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}
