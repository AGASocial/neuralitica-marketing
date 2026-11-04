import type { ApprovalListItemDto } from "@/lib/contracts/approval";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";
import type { MyVideosPendingItem } from "@/lib/approvals/list-my-videos-hub";
import type { AgentCardData } from "./schemas";
import { parseAgentCard } from "./schemas";

export type ProposalCardLabels = {
  title: string;
  approve: string;
  changeSomething: string;
  spendHint: string;
  spendUnknown: string;
  stylePresenter: string;
  styleImages: string;
  styleVoice: string;
  pickVideo: string;
  videoOption: string;
  scriptTitle?: string;
  hookLabel?: string;
  bodyLabel?: string;
  ctaLabel?: string;
  pendingScript?: string;
};

type ProposalLike = {
  kind: string;
  summary: string;
  incursSpend?: boolean;
  estimatedCostCents?: number | null;
  weekStart?: string;
  strategyId?: string;
  themes?: string[];
  approvalId?: string;
  captionPreview?: string;
  videoPreviewUrl?: string;
  coverPreviewUrl?: string;
  changeSummary?: string;
  tema?: string;
  hook?: string;
  body?: string;
  cta?: string;
  slotIndex?: number;
  styleLabel?: "presenter" | "images_and_text" | "voice";
  confirmEstimateCents?: number;
  reelScriptId?: string;
  charCount?: number;
  eligibleVideos?: Array<{
    reelScriptId: string;
    slotIndex: number;
    tema: string;
    estimatedCostCents: number;
    confirmEstimateCents: number;
    charCount: number;
  }>;
  stepLabel?: string;
  answerPreview?: string;
};

function approveChangeActions(labels: ProposalCardLabels) {
  return [
    { id: "approve", label: labels.approve, role: "primary" as const },
    {
      id: "change",
      label: labels.changeSomething,
      role: "secondary" as const,
    },
  ];
}

/**
 * Map orchestrator proposal payloads into catalog cards.
 * Unknown kinds fall back to plan_approval-shaped generic confirm.
 */
export function mapProposalToAgentCard(
  proposal: ProposalLike,
  labels: ProposalCardLabels,
): AgentCardData {
  const actions = approveChangeActions(labels);

  switch (proposal.kind) {
    case "approve_pending_video":
    case "request_video_changes":
      return parseAgentCard({
        type: "reel_approval",
        title: labels.title,
        summary: proposal.summary,
        props: {
          approvalId: proposal.approvalId,
          videoPreviewUrl: proposal.videoPreviewUrl,
          coverPreviewUrl: proposal.coverPreviewUrl,
          captionPreview:
            proposal.kind === "request_video_changes"
              ? proposal.changeSummary ?? proposal.captionPreview
              : proposal.captionPreview,
          previewMode: proposal.videoPreviewUrl ? "player" : "thumbnail",
        },
        actions,
      });

    case "confirm_paid_generation":
      return parseAgentCard({
        type: "cost_confirmation",
        title: labels.title,
        summary: proposal.summary,
        props: {
          estimatedCostCents: proposal.estimatedCostCents ?? null,
          tema: proposal.tema,
          styleLabel:
            proposal.styleLabel === "presenter"
              ? labels.stylePresenter
              : labels.styleImages,
          spendHintTemplate: labels.spendHint,
          spendUnknownLabel: labels.spendUnknown,
        },
        actions,
      });

    case "confirm_tts_generation":
      return parseAgentCard({
        type: "voice_cost",
        title: labels.title,
        summary: proposal.summary,
        props: {
          estimatedCostCents: proposal.estimatedCostCents ?? 0,
          confirmEstimateCents: proposal.confirmEstimateCents ?? 0,
          reelScriptId: proposal.reelScriptId!,
          slotIndex: proposal.slotIndex ?? 0,
          tema: proposal.tema,
          styleLabel: labels.styleVoice,
          eligibleVideos: proposal.eligibleVideos ?? [],
          pickVideoLabel: labels.pickVideo,
          videoOptionTemplate: labels.videoOption,
          spendHintTemplate: labels.spendHint,
        },
        actions,
      });

    case "approve_strategy":
    case "generate_strategy":
    case "generate_scripts":
    case "generate_videos":
      return parseAgentCard({
        type: "plan_approval",
        title: labels.title,
        summary: proposal.summary,
        props: {
          weekStart: proposal.weekStart,
          themes: proposal.themes,
          incursSpend: proposal.incursSpend,
          estimatedCostCents: proposal.estimatedCostCents ?? null,
          spendHintTemplate: labels.spendHint,
          spendUnknownLabel: labels.spendUnknown,
        },
        actions,
      });

    case "regenerate_script":
      return parseAgentCard({
        type: "script_approval",
        title: labels.scriptTitle ?? labels.title,
        summary: proposal.summary,
        props: {
          tema: proposal.tema,
          status: "generated",
          hook: proposal.hook,
          body: proposal.body,
          cta: proposal.cta,
          changeSummary: proposal.changeSummary,
          hookLabel: labels.hookLabel,
          bodyLabel: labels.bodyLabel,
          ctaLabel: labels.ctaLabel,
          pendingLabel: labels.pendingScript,
        },
        actions,
      });

    case "enable_own_avatar":
    case "enable_auto_pilot":
    case "grant_presenter_consent":
    case "set_presenter_voice":
      return parseAgentCard({
        type: "own_avatar_activation",
        title: labels.title,
        summary: proposal.summary,
        props:
          proposal.kind === "enable_auto_pilot"
            ? { detail: proposal.summary.slice(0, 500) }
            : {},
        actions,
      });

    case "save_interview_answer":
      return parseAgentCard({
        type: "clarifying_question",
        title: labels.title,
        summary: proposal.summary,
        props: {
          question: proposal.stepLabel
            ? `${proposal.stepLabel}: ${proposal.answerPreview ?? ""}`
            : (proposal.answerPreview ?? proposal.summary),
          options: [],
        },
        actions,
      });

    case "submit_interview":
      return parseAgentCard({
        type: "plan_approval",
        title: labels.title,
        summary: proposal.summary,
        props: {},
        actions,
      });

    default:
      return parseAgentCard({
        type: "plan_approval",
        title: labels.title,
        summary: proposal.summary,
        props: {
          incursSpend: proposal.incursSpend,
          estimatedCostCents: proposal.estimatedCostCents ?? null,
          spendHintTemplate: labels.spendHint,
          spendUnknownLabel: labels.spendUnknown,
        },
        actions,
      });
  }
}

export function mapApprovalListItemToCard(input: {
  item: ApprovalListItemDto;
  title: string;
  summary: string;
  reviewLabel: string;
  reviewHref: string;
  badges?: string[];
  thumbnailAlt?: string;
  createdAtTemplate?: string;
  locale?: "en" | "es";
}): AgentCardData {
  const previewSrc = input.item.videoAssetId
    ? mediaPreviewUrl(input.item.videoAssetId)
    : undefined;
  return parseAgentCard({
    type: "reel_approval",
    title: input.title,
    summary: input.summary,
    props: {
      approvalId: input.item.approvalId,
      videoPreviewUrl: previewSrc,
      captionPreview: input.item.captionPreview,
      previewMode: "thumbnail",
      badges: input.badges,
      createdAtIso: input.item.createdAt,
      createdAtTemplate: input.createdAtTemplate,
      locale: input.locale,
      thumbnailAlt: input.thumbnailAlt,
    },
    actions: [
      {
        id: "review",
        label: input.reviewLabel,
        role: "primary",
        href: input.reviewHref,
      },
    ],
  });
}

export function mapMyVideosPendingToCard(input: {
  item: MyVideosPendingItem;
  title: string;
  approveLabel: string;
  changeLabel: string;
  changeHref: string;
  badges?: string[];
  locale?: "en" | "es";
  createdAtIso?: string;
}): AgentCardData {
  return parseAgentCard({
    type: "reel_approval",
    title: input.title,
    props: {
      approvalId: input.item.approvalId,
      videoPreviewUrl: input.item.videoPreviewUrl,
      captionPreview: input.item.captionPreview,
      previewMode: input.item.videoPreviewUrl ? "player" : "thumbnail",
      badges: input.badges,
      createdAtIso: input.createdAtIso,
      locale: input.locale,
    },
    actions: [
      { id: "approve", label: input.approveLabel, role: "primary" },
      {
        id: "change",
        label: input.changeLabel,
        role: "secondary",
        href: input.changeHref,
      },
    ],
  });
}

/** Hoy Needs-OK card: Approve + Change (Change opens anchored chat via onAction). */
export function mapHoyPendingToCard(input: {
  item: ApprovalListItemDto & { videoPreviewUrl?: string };
  title: string;
  summary?: string;
  approveLabel: string;
  changeLabel: string;
  badges?: string[];
  locale?: "en" | "es";
}): AgentCardData {
  return parseAgentCard({
    type: "reel_approval",
    title: input.title,
    summary: input.summary,
    props: {
      approvalId: input.item.approvalId,
      videoPreviewUrl: input.item.videoPreviewUrl,
      captionPreview: input.item.captionPreview,
      previewMode: input.item.videoPreviewUrl ? "player" : "thumbnail",
      badges: input.badges,
      createdAtIso: input.item.assembledAt ?? input.item.createdAt,
      locale: input.locale,
    },
    actions: [
      { id: "approve", label: input.approveLabel, role: "primary" },
      { id: "change", label: input.changeLabel, role: "secondary" },
    ],
  });
}
