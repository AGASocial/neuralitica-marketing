import "server-only";

import { tool } from "ai";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  assertProposalIsNonMutating,
  getScriptPreviewInputSchema,
  getScriptPreviewOutputSchema,
  getScriptsStatusInputSchema,
  getScriptsStatusOutputSchema,
  getVideoPreviewInputSchema,
  getVideoPreviewOutputSchema,
  getWeeklyStrategyInputSchema,
  getWeeklyStrategyOutputSchema,
  listCampaignStatusInputSchema,
  listCampaignStatusOutputSchema,
  orchestratorToolErrorSchema,
  proposeApprovePendingVideoInputSchema,
  proposeApprovePendingVideoOutputSchema,
  proposeApproveStrategyInputSchema,
  proposeApproveStrategyOutputSchema,
  getGuidedProgressInputSchema,
  getGuidedProgressOutputSchema,
  getSetupStatusInputSchema,
  getSetupStatusOutputSchema,
  getInterviewStatusInputSchema,
  getInterviewStatusOutputSchema,
  getPresenterSetupStatusInputSchema,
  getPresenterSetupStatusOutputSchema,
  getReadyVideoDownloadInputSchema,
  getReadyVideoDownloadOutputSchema,
  proposeConfirmPaidGenerationInputSchema,
  proposeConfirmPaidGenerationOutputSchema,
  proposeConfirmTtsGenerationInputSchema,
  proposeConfirmTtsGenerationOutputSchema,
  proposeGrantPresenterConsentInputSchema,
  proposeGrantPresenterConsentOutputSchema,
  proposeEnableOwnAvatarInputSchema,
  proposeEnableOwnAvatarOutputSchema,
  proposeSaveInterviewAnswerInputSchema,
  proposeSaveInterviewAnswerOutputSchema,
  proposeSetPresenterVoiceInputSchema,
  proposeSetPresenterVoiceOutputSchema,
  proposeSubmitInterviewInputSchema,
  proposeSubmitInterviewOutputSchema,
  proposeGenerateScriptsInputSchema,
  proposeGenerateScriptsOutputSchema,
  proposeGenerateStrategyInputSchema,
  proposeGenerateStrategyOutputSchema,
  proposeGenerateVideosInputSchema,
  proposeGenerateVideosOutputSchema,
  proposeRegenerateScriptInputSchema,
  proposeRegenerateScriptOutputSchema,
  proposeRequestVideoChangesInputSchema,
  proposeRequestVideoChangesOutputSchema,
  type OrchestratorToolError,
} from "@/lib/contracts/orchestrator-chat";
import { previewBrollVideoJobsEstimate } from "@/lib/video-jobs/actions/preview-broll-video-jobs-estimate";
import { previewHeygenTalkingHeadEstimate } from "@/lib/video-jobs/actions/create-heygen-talking-head-video-job";
import { isFacelessNeedsBroll } from "@/lib/video-jobs/broll-estimate-shared";
import type { Locale } from "@/lib/i18n/locales";
import {
  isOperator,
  orchestratorForbidden,
  orchestratorValidationError,
} from "@/lib/orchestrator-chat/authorize";
import { estimateTtsCostCentsFromTextLength } from "@/lib/orchestrator-chat/estimate-tts-cost";
import { proposalSummary } from "@/lib/orchestrator-chat/proposal-copy";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import {
  getApprovalPackageForClient,
  listApprovedApprovalsForClientUser,
  listPendingApprovalsForClientUser,
} from "@/lib/approvals/list-get-approvals";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { loadSetupCompletion } from "@/lib/dashboard/load-setup-completion";
import { toContentStrategyView } from "@/lib/content-strategy/to-strategy-view";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import { INTERVIEW_STEP_ORDER } from "@/lib/contracts/interview";
import { validateInterviewCompleteness } from "@/lib/interview/completeness";
import {
  summarizeInterviewSessionRow,
  toInterviewDraftView,
} from "@/lib/interview/merge-answers";
import { isUniqueViolation } from "@/lib/interview/postgres-errors";
import {
  answeredInterviewSteps,
  buildInterviewAnswerFragment,
  formatInterviewAnswerPreview,
  interviewStepIndex,
  interviewStepQuestion,
  interviewTotalSteps,
  isInterviewTextStep,
} from "@/lib/orchestrator-chat/interview-questions";
import { getAvatarForClientId } from "@/lib/avatars/get-avatar-for-client";
import {
  FACELESS_STYLE_DEFAULT,
  facelessStyleSchema,
  visualModalitySchema,
  type FacelessStyle,
  type VisualModality,
} from "@/lib/contracts/visual-preferences";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function toolError(error: OrchestratorToolError) {
  return orchestratorToolErrorSchema.parse(error);
}

function guidedHint(
  locale: Locale,
  key:
    | "interview"
    | "plan"
    | "scripts"
    | "videos"
    | "approve"
    | "ready",
): string {
  const es = locale === "es";
  switch (key) {
    case "interview":
      return es
        ? "Siguiente: completa la ficha de tu negocio (entrevista)."
        : "Next: finish your business interview.";
    case "plan":
      return es
        ? "Siguiente: armar o aprobar el plan de esta semana."
        : "Next: create or approve this week’s plan.";
    case "scripts":
      return es
        ? "Siguiente: escribir los textos de los videos."
        : "Next: write the video texts.";
    case "videos":
      return es
        ? "Siguiente: confirmar el costo y crear los videos (con tu cara o solo imágenes y texto)."
        : "Next: confirm the cost and create the videos (with your face or images and text only).";
    case "approve":
      return es
        ? "Siguiente: mira tus videos y apruébalos o pide cambios."
        : "Next: watch your videos and approve or request changes.";
    case "ready":
      return es
        ? "Listo: tus videos están preparados para descargar o publicar aparte (nunca desde este chat)."
        : "Done: your videos are ready to download or publish separately (never from this chat).";
    default:
      return es ? "Dime cómo te ayudo." : "Tell me how I can help.";
  }
}

export function createOrchestratorTools(user: CurrentUser, locale: Locale) {
  return {
    listCampaignStatus: tool({
      description:
        "Show where the owner’s campaign stands: videos waiting for approval, videos ready to post, and this week’s plan status.",
      inputSchema: listCampaignStatusInputSchema,
      execute: async (raw) => {
        const parsed = listCampaignStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);

        const [pending, approved] = await Promise.all([
          listPendingApprovalsForClientUser({ user }),
          listApprovedApprovalsForClientUser({ user }),
        ]);

        if (!pending.ok || !approved.ok) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Could not load campaign status.",
          });
        }

        let strategyStatus: "none" | "draft" | "approved" | "unknown" =
          "unknown";
        let strategyId: string | undefined;
        let scriptsGeneratedCount: number | undefined;
        let scriptsPendingCount: number | undefined;

        try {
          const row = await loadLatestStrategyRowWithApproval({
            clientId: user.id,
            weekStart,
          });
          if (!row) {
            strategyStatus = "none";
          } else {
            strategyStatus = row.status === "approved" ? "approved" : "draft";
            strategyId = row.id;
          }

          if (isOperator(user) && row?.status === "approved") {
            const { items } = await buildReelScriptListForStrategy({
              clientId: user.id,
              weekStart,
              strategyId: row.id,
              version: row.version,
              brief: row.brief,
            });
            scriptsGeneratedCount = items.filter(
              (i) => i.status === "generated",
            ).length;
            scriptsPendingCount = items.filter(
              (i) => i.status === "pending",
            ).length;
          }
        } catch {
          strategyStatus = "unknown";
        }

        return listCampaignStatusOutputSchema.parse({
          ok: true,
          role: user.role,
          weekStart,
          pendingApprovalsCount: pending.items.length,
          approvedReadyCount: approved.items.length,
          pendingApprovals: pending.items.slice(0, 10).map((item) => ({
            approvalId: item.approvalId,
            status: item.status,
            captionPreview: item.captionPreview?.slice(0, 200),
          })),
          strategyStatus,
          strategyId,
          scriptsGeneratedCount,
          scriptsPendingCount,
        });
      },
    }),

    getWeeklyStrategy: tool({
      description:
        "Load this week’s content plan (themes and video topics) for the signed-in business.",
      inputSchema: getWeeklyStrategyInputSchema,
      execute: async (raw) => {
        const parsed = getWeeklyStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);

        const row = await loadLatestStrategyRowWithApproval({
          clientId: user.id,
          weekStart,
        });
        if (!row) {
          return getWeeklyStrategyOutputSchema.parse({
            ok: true,
            weekStart,
            strategy: null,
          });
        }

        const view = await toContentStrategyView(row);
        return getWeeklyStrategyOutputSchema.parse({
          ok: true,
          weekStart,
          strategy: {
            id: view.id,
            version: view.version,
            status: view.status,
            pillars: view.brief.pillars,
            themes: view.brief.themes,
            slots: view.brief.slots.map((slot) => ({
              slotIndex: slot.slotIndex,
              tema: slot.tema,
              goal: slot.goal,
              formatoPlaybookSlug: slot.formatoPlaybookSlug,
              modalidad: slot.modalidad,
            })),
            isEditable: view.isEditable,
          },
        });
      },
    }),

    getScriptsStatus: tool({
      description:
        "Operator/Advanced: list script readiness for this week’s approved plan (plain status per video).",
      inputSchema: getScriptsStatusInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = getScriptsStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return getScriptsStatusOutputSchema.parse({
            ok: true,
            weekStart,
            approvedStrategyId: null,
            items: [],
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        return getScriptsStatusOutputSchema.parse({
          ok: true,
          weekStart,
          approvedStrategyId: approved.id,
          items: items.map((item) => ({
            slotIndex: item.slotIndex,
            scriptId: item.scriptId,
            tema: item.tema,
            status: item.status,
            modalidad: item.modalidad,
          })),
        });
      },
    }),

    proposeGenerateStrategy: tool({
      description:
        "Propose creating this week’s content plan. Does NOT create anything until the user taps Approve on the card.",
      inputSchema: proposeGenerateStrategyInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const proposal = {
          kind: "generate_strategy" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_strategy"),
          weekStart,
          action: "generateContentStrategy" as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateStrategyOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeApproveStrategy: tool({
      description:
        "Propose approving the draft weekly plan. Does NOT approve until the user taps Approve on the card.",
      inputSchema: proposeApproveStrategyInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeApproveStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const row = await loadLatestStrategyRowWithApproval({
          clientId: user.id,
          weekStart,
        });
        if (!row || row.status !== "draft") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No draft plan to approve for that week.",
          });
        }
        if (
          parsed.data.strategyId !== undefined &&
          parsed.data.strategyId !== row.id
        ) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "That plan was not found.",
          });
        }
        const view = await toContentStrategyView(row);
        const proposal = {
          kind: "approve_strategy" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "approve_strategy", {
            slotCount: view.brief.slots.length,
          }),
          weekStart,
          strategyId: view.id,
          action: "approveContentStrategy" as const,
          slotCount: view.brief.slots.length,
          themes: view.brief.themes,
        };
        assertProposalIsNonMutating(proposal);
        return proposeApproveStrategyOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeApprovePendingVideo: tool({
      description:
        "Propose approving a video waiting for the owner, with playable preview. Does NOT approve until the user taps Approve on the card.",
      inputSchema: proposeApprovePendingVideoInputSchema,
      execute: async (raw) => {
        const parsed = proposeApprovePendingVideoInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const pending = await listPendingApprovalsForClientUser({ user });
        if (!pending.ok) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Could not load videos waiting for approval.",
          });
        }
        const item =
          parsed.data.approvalId !== undefined
            ? pending.items.find((i) => i.approvalId === parsed.data.approvalId)
            : pending.items[0];
        if (!item) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No video is waiting for approval right now.",
          });
        }
        const pkg = await getApprovalPackageForClient({
          rawInput: { approvalId: item.approvalId },
          user,
        });
        const proposal = {
          kind: "approve_pending_video" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "approve_pending_video"),
          approvalId: item.approvalId,
          action: "decideApproval" as const,
          decision: "approved" as const,
          captionPreview:
            pkg.ok === true
              ? pkg.package.caption.body.slice(0, 500)
              : item.captionPreview?.slice(0, 500),
          ...(pkg.ok === true
            ? {
                videoPreviewUrl: pkg.package.video.previewUrl,
                ...(pkg.package.cover?.previewUrl
                  ? { coverPreviewUrl: pkg.package.cover.previewUrl }
                  : {}),
              }
            : {}),
        };
        assertProposalIsNonMutating(proposal);
        return proposeApprovePendingVideoOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    getVideoPreview: tool({
      description:
        "Show a playable preview of a video waiting for the owner (or a specific approval). Use when the user asks to see/watch a video.",
      inputSchema: getVideoPreviewInputSchema,
      execute: async (raw) => {
        const parsed = getVideoPreviewInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        let approvalId = parsed.data.approvalId;
        if (!approvalId) {
          const pending = await listPendingApprovalsForClientUser({ user });
          if (!pending.ok || pending.items.length === 0) {
            return toolError({
              ok: false,
              error: "NOT_FOUND",
              message: "No video is waiting for approval right now.",
            });
          }
          approvalId = pending.items[0]!.approvalId;
        }
        const pkg = await getApprovalPackageForClient({
          rawInput: { approvalId },
          user,
        });
        if (!pkg.ok) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Could not load that video preview.",
          });
        }
        return getVideoPreviewOutputSchema.parse({
          ok: true,
          approvalId: pkg.package.approvalId,
          status: pkg.package.status,
          videoPreviewUrl: pkg.package.video.previewUrl,
          ...(pkg.package.cover?.previewUrl
            ? { coverPreviewUrl: pkg.package.cover.previewUrl }
            : {}),
          captionBody: pkg.package.caption.body.slice(0, 2000),
          selectedCtaText: pkg.package.caption.selectedCtaText.slice(0, 200),
        });
      },
    }),

    getScriptPreview: tool({
      description:
        "Show the plain-language write-up for one video this week so the owner can read it. Operator/Advanced.",
      inputSchema: getScriptPreviewInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = getScriptPreviewInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No approved plan with write-ups for that week.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const slotIndex =
          parsed.data.slotIndex ??
          items.find((i) => i.status === "generated")?.slotIndex ??
          items[0]?.slotIndex;
        if (slotIndex === undefined) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No write-up to show.",
          });
        }
        const item = items.find((i) => i.slotIndex === slotIndex);
        if (!item) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No write-up for that video.",
          });
        }
        return getScriptPreviewOutputSchema.parse({
          ok: true,
          weekStart,
          slotIndex: item.slotIndex,
          scriptId: item.scriptId,
          tema: item.tema,
          status: item.status,
          ...(item.package
            ? {
                hook: item.package.hook.slice(0, 500),
                body: item.package.body.slice(0, 2000),
                cta: item.package.cta.slice(0, 300),
              }
            : {}),
        });
      },
    }),

    proposeRequestVideoChanges: tool({
      description:
        "Propose requesting changes on a pending video after the owner describes what to change. Does NOT submit until Approve. Call this when they use Change something and tell you the edit.",
      inputSchema: proposeRequestVideoChangesInputSchema,
      execute: async (raw) => {
        const parsed = proposeRequestVideoChangesInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const pending = await listPendingApprovalsForClientUser({ user });
        if (!pending.ok) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Could not load videos waiting for approval.",
          });
        }
        const item =
          parsed.data.approvalId !== undefined
            ? pending.items.find((i) => i.approvalId === parsed.data.approvalId)
            : pending.items[0];
        if (!item) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No video is waiting for approval right now.",
          });
        }
        const pkg = await getApprovalPackageForClient({
          rawInput: { approvalId: item.approvalId },
          user,
        });
        const tags = parsed.data.tags ?? ["script", "caption"];
        const proposal = {
          kind: "request_video_changes" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "request_video_changes"),
          approvalId: item.approvalId,
          action: "decideApproval" as const,
          decision: "request_changes" as const,
          changeSummary: parsed.data.changeSummary.slice(0, 500),
          tags,
          captionPreview:
            pkg.ok === true
              ? pkg.package.caption.body.slice(0, 500)
              : item.captionPreview?.slice(0, 500),
          ...(pkg.ok === true
            ? {
                videoPreviewUrl: pkg.package.video.previewUrl,
                ...(pkg.package.cover?.previewUrl
                  ? { coverPreviewUrl: pkg.package.cover.previewUrl }
                  : {}),
              }
            : {}),
        };
        assertProposalIsNonMutating(proposal);
        return proposeRequestVideoChangesOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeRegenerateScript: tool({
      description:
        "Propose rewriting one video’s write-up after the owner describes the change. Does NOT regenerate until Approve. Operator/Advanced.",
      inputSchema: proposeRegenerateScriptInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeRegenerateScriptInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No approved plan for that week.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const item = items.find((i) => i.slotIndex === parsed.data.slotIndex);
        if (!item || item.status !== "generated" || !item.package) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "That write-up is not ready to rewrite yet.",
          });
        }
        const proposal = {
          kind: "regenerate_script" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "regenerate_script"),
          weekStart,
          slotIndex: item.slotIndex,
          action: "regenerateReelScriptSlot" as const,
          ...(parsed.data.changeSummary
            ? { changeSummary: parsed.data.changeSummary.slice(0, 500) }
            : {}),
          tema: item.tema,
          hook: item.package.hook.slice(0, 500),
          body: item.package.body.slice(0, 2000),
          cta: item.package.cta.slice(0, 300),
        };
        assertProposalIsNonMutating(proposal);
        return proposeRegenerateScriptOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeGenerateScripts: tool({
      description:
        "Propose writing this week’s video texts (scripts). Does NOT generate until the user taps Approve on the card. Call this whenever you offer to write/create the texts.",
      inputSchema: proposeGenerateScriptsInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateScriptsInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before writing the videos.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const pendingSlotCount = items.filter(
          (i) => i.status === "pending",
        ).length;
        const proposal = {
          kind: "generate_scripts" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_scripts"),
          weekStart,
          action: "generateReelScripts" as const,
          pendingSlotCount,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateScriptsOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeGenerateVideos: tool({
      description:
        "Propose preparing video generation for this week. Does NOT spend on paid video until a later cost-confirm card. Call this whenever you offer to generate/create the videos.",
      inputSchema: proposeGenerateVideosInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateVideosInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before creating videos.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const readyScriptCount = items.filter(
          (i) => i.status === "generated",
        ).length;
        const proposal = {
          kind: "generate_videos" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_videos"),
          weekStart,
          action: "generateReelScripts" as const,
          readyScriptCount,
          paidMediaRequiresCostConfirm: true as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateVideosOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeConfirmPaidGeneration: tool({
      description:
        "Propose paid video generation with a plain-language price from cost policy. Does NOT spend until the user taps Approve on the cost card. Call this before any on-camera, stock-footage, or paid video create.",
      inputSchema: proposeConfirmPaidGenerationInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeConfirmPaidGenerationInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before creating videos.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const generated = items.filter(
          (i) => i.status === "generated" && i.scriptId && i.package,
        );
        const item =
          parsed.data.reelScriptId !== undefined
            ? generated.find((i) => i.scriptId === parsed.data.reelScriptId)
            : parsed.data.slotIndex !== undefined
              ? generated.find((i) => i.slotIndex === parsed.data.slotIndex)
              : generated[0];
        if (!item || !item.scriptId || !item.package) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Write the video texts first, then confirm the cost.",
          });
        }

        const needsBroll = isFacelessNeedsBroll({
          visualMode: item.modalidad,
          modalidad: item.modalidad,
          brollBeatCount: item.package.brollBeats?.length ?? 0,
        });

        if (needsBroll) {
          const preview = await previewBrollVideoJobsEstimate({
            reelScriptId: item.scriptId,
            clientId: user.id,
          });
          if (!preview.ok) {
            return toolError({
              ok: false,
              error: "INTERNAL",
              message: "Could not estimate the video cost.",
            });
          }
          if (
            "blockedReasonKey" in preview &&
            preview.blockedReasonKey !== undefined
          ) {
            return toolError({
              ok: false,
              error: "NOT_FOUND",
              message: "That video cannot be generated right now.",
            });
          }
          const estimatedCostCents = preview.estimatedCostCents;
          const proposal = {
            kind: "confirm_paid_generation" as const,
            requiresConfirmation: true as const,
            mutates: false as const,
            incursSpend: true as const,
            estimatedCostCents,
            confirmEstimateCents: estimatedCostCents,
            summary: proposalSummary(locale, "confirm_paid_generation", {
              amountCents: estimatedCostCents,
            }),
            weekStart,
            slotIndex: item.slotIndex,
            reelScriptId: item.scriptId,
            tema: item.tema,
            styleLabel: "images_and_text" as const,
            paidKind: "broll" as const,
            action: "confirmPaidGenerationFromChat" as const,
          };
          assertProposalIsNonMutating(proposal);
          return proposeConfirmPaidGenerationOutputSchema.parse({
            ok: true,
            proposal,
          });
        }

        const preview = await previewHeygenTalkingHeadEstimate({
          reelScriptId: item.scriptId,
          clientId: user.id,
          targetDurationSec: item.package.targetDurationSec,
        });
        if (!preview.ok || !preview.eligible) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message:
              "On-camera video is not ready yet (photo/consent may be missing).",
          });
        }
        const estimatedCostCents = preview.estimatedCostCents;
        const proposal = {
          kind: "confirm_paid_generation" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true as const,
          estimatedCostCents,
          confirmEstimateCents: estimatedCostCents,
          summary: proposalSummary(locale, "confirm_paid_generation", {
            amountCents: estimatedCostCents,
          }),
          weekStart,
          slotIndex: item.slotIndex,
          reelScriptId: item.scriptId,
          tema: item.tema,
          styleLabel: "presenter" as const,
          paidKind: "heygen" as const,
          action: "confirmPaidGenerationFromChat" as const,
          targetDurationSec: preview.durationSec,
        };
        assertProposalIsNonMutating(proposal);
        return proposeConfirmPaidGenerationOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeConfirmTtsGeneration: tool({
      description:
        "MUST call when the owner asks voice/spoken-audio cost or to create voice for a video (ES: “¿Cuánto cuesta la voz para mi video?”, “cuánto sale la voz”, “genera la voz”). Returns confirm_tts_generation card with plain ElevenLabs catalog price. If reelScriptId/slotIndex omitted, defaults to the latest eligible write-up and includes eligibleVideos for an in-card picker. DISTINCT from proposeConfirmPaidGeneration (video). Does NOT synthesize until Approve. Operator only.",
      inputSchema: proposeConfirmTtsGenerationInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeConfirmTtsGenerationInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before creating voiceovers.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const generated = items.filter(
          (i) =>
            i.status === "generated" &&
            i.scriptId &&
            i.package &&
            (i.package.voiceoverText?.trim() ?? "").length > 0,
        );
        const eligibleVideos = generated
          .map((i) => {
            const voiceoverText = i.package!.voiceoverText!.trim();
            const estimatedCostCents = estimateTtsCostCentsFromTextLength(
              voiceoverText.length,
            );
            return {
              reelScriptId: i.scriptId!,
              slotIndex: i.slotIndex,
              tema: i.tema.slice(0, 200),
              estimatedCostCents,
              confirmEstimateCents: estimatedCostCents,
              charCount: voiceoverText.length,
            };
          })
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .slice(0, 7);
        if (eligibleVideos.length === 0) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Write the video texts first, then confirm the voice cost.",
          });
        }
        // Latest eligible = highest slotIndex (most recent in the weekly plan).
        const latest = eligibleVideos.reduce((a, b) =>
          b.slotIndex >= a.slotIndex ? b : a,
        );
        const selected =
          parsed.data.reelScriptId !== undefined
            ? eligibleVideos.find(
                (v) => v.reelScriptId === parsed.data.reelScriptId,
              )
            : parsed.data.slotIndex !== undefined
              ? eligibleVideos.find((v) => v.slotIndex === parsed.data.slotIndex)
              : latest;
        if (!selected) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Write the video texts first, then confirm the voice cost.",
          });
        }
        const proposal = {
          kind: "confirm_tts_generation" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true as const,
          estimatedCostCents: selected.estimatedCostCents,
          confirmEstimateCents: selected.confirmEstimateCents,
          summary: proposalSummary(locale, "confirm_tts_generation", {
            amountCents: selected.estimatedCostCents,
          }),
          weekStart,
          slotIndex: selected.slotIndex,
          reelScriptId: selected.reelScriptId,
          tema: selected.tema,
          styleLabel: "voice" as const,
          paidKind: "tts" as const,
          action: "confirmTtsGenerationFromChat" as const,
          charCount: selected.charCount,
          eligibleVideos,
        };
        assertProposalIsNonMutating(proposal);
        return proposeConfirmTtsGenerationOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    getSetupStatus: tool({
      description:
        "Show setup / onboarding completion: business profile, interview, visual preferences, Instagram connect, plan approved, optional presenter. Call for “what’s left?” / “¿Qué me falta?”. Read-only; never mutates, spends, or publishes.",
      inputSchema: getSetupStatusInputSchema,
      execute: async (raw) => {
        const parsed = getSetupStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const completion = await loadSetupCompletion({ user });
        return getSetupStatusOutputSchema.parse({
          ok: true,
          percentComplete: completion.percentComplete,
          requiredDone: completion.requiredDone,
          requiredTotal: completion.requiredTotal,
          steps: completion.steps.map((step) => ({
            id: step.id,
            done: step.done,
            required: step.required,
          })),
        });
      },
    }),

    getGuidedProgress: tool({
      description:
        "Show the owner’s end-to-end progress from business interview → plan → write-ups → videos → approve → ready to download. Call when they ask where they are or how to continue. Never offers Instagram publish.",
      inputSchema: getGuidedProgressInputSchema,
      execute: async (raw) => {
        const parsed = getGuidedProgressInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(undefined);

        let interviewStatus: "not_started" | "in_progress" | "completed" =
          "not_started";
        if (isSupabaseConfigured()) {
          const supabase = createServerSupabaseClient();
          const { data } = await supabase
            .from("neuramark_interview_sessions")
            .select("current_step, answers, status")
            .eq("client_id", user.id)
            .maybeSingle();
          const summary = summarizeInterviewSessionRow(data);
          if (summary == null) {
            interviewStatus = "not_started";
          } else if (summary.status === "completed") {
            interviewStatus = "completed";
          } else {
            interviewStatus = "in_progress";
          }
        }

        const [pending, approvedList] = await Promise.all([
          listPendingApprovalsForClientUser({ user }),
          listApprovedApprovalsForClientUser({ user }),
        ]);
        const pendingApprovalsCount = pending.ok ? pending.items.length : 0;
        const readyVideosCount = approvedList.ok
          ? approvedList.items.length
          : 0;

        let strategyStatus: "none" | "draft" | "approved" | "unknown" = "none";
        let scriptsReadyCount = 0;
        let scriptsPendingCount = 0;
        try {
          const row = await loadLatestStrategyRowWithApproval({
            clientId: user.id,
            weekStart,
          });
          if (!row) {
            strategyStatus = "none";
          } else {
            strategyStatus = row.status === "approved" ? "approved" : "draft";
            if (row.status === "approved") {
              const { items } = await buildReelScriptListForStrategy({
                clientId: user.id,
                weekStart,
                strategyId: row.id,
                version: row.version,
                brief: row.brief,
              });
              scriptsReadyCount = items.filter(
                (i) => i.status === "generated",
              ).length;
              scriptsPendingCount = items.filter(
                (i) => i.status === "pending",
              ).length;
            }
          }
        } catch {
          strategyStatus = "unknown";
        }

        const interviewDone = interviewStatus === "completed";
        const planDone = strategyStatus === "approved";
        const scriptsDone = planDone && scriptsPendingCount === 0 && scriptsReadyCount > 0;
        const videosDone = pendingApprovalsCount + readyVideosCount > 0;
        const approveDone = pendingApprovalsCount === 0 && readyVideosCount > 0;
        const readyDone = readyVideosCount > 0 && pendingApprovalsCount === 0;

        let nextStepKey:
          | "interview"
          | "plan"
          | "scripts"
          | "videos"
          | "approve"
          | "ready" = "interview";
        if (!interviewDone) {
          nextStepKey = "interview";
        } else if (!planDone) {
          nextStepKey = "plan";
        } else if (!scriptsDone) {
          nextStepKey = "scripts";
        } else if (!videosDone) {
          nextStepKey = "videos";
        } else if (!approveDone) {
          nextStepKey = "approve";
        } else {
          nextStepKey = "ready";
        }

        const stepStatus = (
          key: typeof nextStepKey,
          done: boolean,
        ): "todo" | "current" | "done" => {
          if (done) return "done";
          if (key === nextStepKey) return "current";
          return "todo";
        };

        return getGuidedProgressOutputSchema.parse({
          ok: true,
          interviewStatus,
          interviewHref: "/interview",
          weekStart,
          strategyStatus,
          scriptsReadyCount,
          scriptsPendingCount,
          pendingApprovalsCount,
          readyVideosCount,
          steps: [
            {
              key: "interview",
              status: stepStatus("interview", interviewDone),
            },
            { key: "plan", status: stepStatus("plan", planDone) },
            { key: "scripts", status: stepStatus("scripts", scriptsDone) },
            { key: "videos", status: stepStatus("videos", videosDone) },
            { key: "approve", status: stepStatus("approve", approveDone) },
            { key: "ready", status: stepStatus("ready", readyDone) },
          ],
          nextStepKey,
          nextStepHint: guidedHint(locale, nextStepKey),
        });
      },
    }),

    getInterviewStatus: tool({
      description:
        "Load the owner’s business interview (ficha) progress from neuramark_interview_sessions — same as /interview. Returns the current question so you can ask ONE step at a time. Does not save answers.",
      inputSchema: getInterviewStatusInputSchema,
      execute: async (raw) => {
        const parsed = getInterviewStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        if (!isSupabaseConfigured()) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Interview unavailable.",
          });
        }

        const supabase = createServerSupabaseClient();
        let row = (
          await supabase
            .from("neuramark_interview_sessions")
            .select("current_step, answers, status")
            .eq("client_id", user.id)
            .maybeSingle()
        ).data;

        if (!row) {
          const inserted = await supabase
            .from("neuramark_interview_sessions")
            .insert({
              client_id: user.id,
              status: "draft",
              current_step: "services",
              answers: {},
            })
            .select("current_step, answers, status")
            .maybeSingle();
          if (inserted.error && isUniqueViolation(inserted.error)) {
            row = (
              await supabase
                .from("neuramark_interview_sessions")
                .select("current_step, answers, status")
                .eq("client_id", user.id)
                .maybeSingle()
            ).data;
          } else if (inserted.data) {
            row = inserted.data;
          }
        }

        if (!row) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Interview unavailable.",
          });
        }

        const draft = toInterviewDraftView(row);
        const summary = summarizeInterviewSessionRow(row);
        let status: "not_started" | "in_progress" | "completed" = "not_started";
        if (summary?.status === "completed") {
          status = "completed";
        } else if (summary != null) {
          status = answeredInterviewSteps(draft.answers).length > 0
            ? "in_progress"
            : "not_started";
        }

        const currentStep =
          status === "completed"
            ? INTERVIEW_STEP_ORDER[INTERVIEW_STEP_ORDER.length - 1]!
            : draft.currentStep;
        const q = interviewStepQuestion(locale, currentStep);
        const answeredCount = answeredInterviewSteps(draft.answers).length;
        const canSubmit =
          status !== "completed" &&
          validateInterviewCompleteness(draft.answers).ok;
        const stepIndex = interviewStepIndex(currentStep);
        const totalSteps = interviewTotalSteps();
        const progressLabel =
          locale === "es"
            ? `${stepIndex} / ${totalSteps}`
            : `${stepIndex} / ${totalSteps}`;

        return getInterviewStatusOutputSchema.parse({
          ok: true,
          status,
          currentStep,
          stepIndex,
          totalSteps: 7 as const,
          answeredCount,
          stepLabel: q.label,
          question: q.question,
          helper: q.helper,
          answerKind: isInterviewTextStep(currentStep) ? "text" : "list",
          canSubmit,
          interviewHref: "/interview",
          progressLabel,
        });
      },
    }),

    proposeSaveInterviewAnswer: tool({
      description:
        "Propose saving one interview step answer (list items or text description) via persistInterviewDraft. Does NOT save until Approve. Ask only one step at a time.",
      inputSchema: proposeSaveInterviewAnswerInputSchema,
      execute: async (raw) => {
        const parsed = proposeSaveInterviewAnswerInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const fragment = buildInterviewAnswerFragment(parsed.data);
        if (!fragment) {
          return toolError(orchestratorValidationError());
        }
        const q = interviewStepQuestion(locale, parsed.data.currentStep);
        const answerPreview =
          formatInterviewAnswerPreview(parsed.data.currentStep, fragment) ||
          (locale === "es" ? "(ninguna)" : "(none)");
        const proposal = {
          kind: "save_interview_answer" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false as const,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "save_interview_answer", {
            stepLabel: q.label,
          }),
          action: "persistInterviewDraft" as const,
          currentStep: parsed.data.currentStep,
          stepLabel: q.label,
          answerPreview: answerPreview.slice(0, 500),
          ...(parsed.data.description != null
            ? { description: parsed.data.description.trim() }
            : {}),
          ...(parsed.data.items != null
            ? {
                items: parsed.data.items
                  .map((item) => item.trim())
                  .filter(Boolean),
              }
            : {}),
        };
        assertProposalIsNonMutating(proposal);
        return proposeSaveInterviewAnswerOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeSubmitInterview: tool({
      description:
        "Propose finishing the business interview the same way /interview Submit does (profile upsert + completed). Call only when getInterviewStatus.canSubmit is true. Does NOT submit until Approve.",
      inputSchema: proposeSubmitInterviewInputSchema,
      execute: async (raw) => {
        const parsed = proposeSubmitInterviewInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        if (isSupabaseConfigured()) {
          const supabase = createServerSupabaseClient();
          const { data } = await supabase
            .from("neuramark_interview_sessions")
            .select("current_step, answers, status")
            .eq("client_id", user.id)
            .maybeSingle();
          if (!data) {
            return toolError({
              ok: false,
              error: "NOT_FOUND",
              message: "No interview to submit.",
            });
          }
          const draft = toInterviewDraftView(data);
          if (draft.status === "completed") {
            // Soft allow — submitInterview handles already-completed.
          } else if (!validateInterviewCompleteness(draft.answers).ok) {
            return toolError(orchestratorValidationError());
          }
        }
        const proposal = {
          kind: "submit_interview" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false as const,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "submit_interview"),
          action: "submitInterview" as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeSubmitInterviewOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    getPresenterSetupStatus: tool({
      description:
        "Show on-camera presenter setup status: consent, photo-ready style, gender/language. Use when the owner wants videos with their face.",
      inputSchema: getPresenterSetupStatusInputSchema,
      execute: async (raw) => {
        const parsed = getPresenterSetupStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const [consentActive, avatar] = await Promise.all([
          hasActiveAvatarConsent(user.id),
          getAvatarForClientId(user.id),
        ]);
        let onCameraEnabled = false;
        if (isSupabaseConfigured()) {
          const supabase = createServerSupabaseClient();
          const { data } = await supabase
            .from("neuramark_visual_preferences")
            .select("allowed_modes")
            .eq("client_id", user.id)
            .maybeSingle();
          const modes = data?.allowed_modes;
          onCameraEnabled =
            Array.isArray(modes) && modes.includes("own_avatar");
        }
        const hasPresenterConfig = avatar.exists === true;
        const gender =
          avatar.exists === true ? avatar.avatar.gender : null;
        const language =
          avatar.exists === true ? avatar.avatar.language : null;
        const es = locale === "es";
        let nextHint: string;
        if (!consentActive) {
          nextHint = es
            ? "Siguiente: confirma que podemos usar tu foto (tarjeta de consentimiento) y adjunta una foto clara."
            : "Next: confirm we can use your photo (consent card) and attach a clear photo.";
        } else if (!hasPresenterConfig) {
          nextHint = es
            ? "Siguiente: elige cómo suena tu presentador (hombre/mujer e idioma) para que coincida con tu foto."
            : "Next: choose how your presenter should sound (male/female and language) to match your photo.";
        } else if (!onCameraEnabled) {
          nextHint = es
            ? "Siguiente: aprueba la tarjeta para activar videos con tu cara (solo Preferencias; no crea videos)."
            : "Next: approve the card to enable on-camera videos (Preferences only; does not create videos).";
        } else {
          nextHint = es
            ? "Tu presentador está listo. Podemos crear videos con tu cara (con confirmación de costo)."
            : "Your presenter setup is ready. We can create on-camera videos (with cost confirmation).";
        }
        return getPresenterSetupStatusOutputSchema.parse({
          ok: true,
          consentActive,
          onCameraEnabled,
          hasPresenterConfig,
          gender,
          language,
          nextHint,
        });
      },
    }),

    proposeGrantPresenterConsent: tool({
      description:
        "Propose granting consent to use the owner’s photo for on-camera videos. Does NOT grant until Approve.",
      inputSchema: proposeGrantPresenterConsentInputSchema,
      execute: async (raw) => {
        const parsed = proposeGrantPresenterConsentInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const proposal = {
          kind: "grant_presenter_consent" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false as const,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "grant_presenter_consent"),
          action: "grantAvatarConsent" as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGrantPresenterConsentOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeSetPresenterVoice: tool({
      description:
        "Propose saving presenter gender + language so voice matches the photo. Plain inputs only (male/female, en/es). Does NOT save until Approve.",
      inputSchema: proposeSetPresenterVoiceInputSchema,
      execute: async (raw) => {
        const parsed = proposeSetPresenterVoiceInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const proposal = {
          kind: "set_presenter_voice" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false as const,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "set_presenter_voice"),
          action: "upsertAvatar" as const,
          gender: parsed.data.gender,
          language: parsed.data.language,
        };
        assertProposalIsNonMutating(proposal);
        return proposeSetPresenterVoiceOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeEnableOwnAvatar: tool({
      description:
        "MUST call when the owner wants on-camera / “with your face” / own avatar videos (ES: “Quiero usar mi propio avatar”, “quiero salir yo en los videos”, “activa videos con mi cara”). Returns enable_own_avatar Preferencias confirmation card (Aprobar / Cambiar algo). If photo consent is missing, returns the grant_presenter_consent card instead (redirectedToConsent). Does NOT save until Approve. NEVER starts avatar video jobs, talking-head, HeyGen, or any paid generation.",
      inputSchema: proposeEnableOwnAvatarInputSchema,
      execute: async (raw) => {
        const parsed = proposeEnableOwnAvatarInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const consentActive = await hasActiveAvatarConsent(user.id);
        if (!consentActive) {
          const consentProposal = {
            kind: "grant_presenter_consent" as const,
            requiresConfirmation: true as const,
            mutates: false as const,
            incursSpend: false as const,
            estimatedCostCents: null,
            summary: proposalSummary(locale, "grant_presenter_consent"),
            action: "grantAvatarConsent" as const,
          };
          assertProposalIsNonMutating(consentProposal);
          return proposeEnableOwnAvatarOutputSchema.parse({
            ok: true,
            redirectedToConsent: true,
            proposal: consentProposal,
          });
        }
        if (!isSupabaseConfigured()) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Preferences unavailable.",
          });
        }
        const supabase = createServerSupabaseClient();
        const { data } = await supabase
          .from("neuramark_visual_preferences")
          .select("allowed_modes, faceless_style")
          .eq("client_id", user.id)
          .maybeSingle();

        const existingModes: VisualModality[] = [];
        if (Array.isArray(data?.allowed_modes)) {
          for (const mode of data.allowed_modes) {
            const m = visualModalitySchema.safeParse(mode);
            if (m.success && !existingModes.includes(m.data)) {
              existingModes.push(m.data);
            }
          }
        }
        if (existingModes.includes("own_avatar")) {
          return toolError({
            ok: false,
            error: "VALIDATION_ERROR",
            message:
              locale === "es"
                ? "Ya tienes activados los videos con tu cara."
                : "On-camera videos are already enabled.",
          });
        }

        const allowedModes: VisualModality[] = [
          ...existingModes,
          "own_avatar",
        ];
        let facelessStyle: FacelessStyle | null = null;
        if (allowedModes.includes("faceless")) {
          const styleParsed = facelessStyleSchema.safeParse(
            data?.faceless_style,
          );
          facelessStyle = styleParsed.success
            ? styleParsed.data
            : { ...FACELESS_STYLE_DEFAULT };
        }

        const proposal = {
          kind: "enable_own_avatar" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false as const,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "enable_own_avatar"),
          action: "upsertVisualPreferences" as const,
          allowedModes,
          facelessStyle,
        };
        assertProposalIsNonMutating(proposal);
        return proposeEnableOwnAvatarOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    getReadyVideoDownload: tool({
      description:
        "Show a ready video the owner can download (not Instagram publish). Use when they ask to download or get a finished video.",
      inputSchema: getReadyVideoDownloadInputSchema,
      execute: async (raw) => {
        const parsed = getReadyVideoDownloadInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const approved = await listApprovedApprovalsForClientUser({ user });
        if (!approved.ok || approved.items.length === 0) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No finished videos ready to download yet.",
          });
        }
        const item =
          parsed.data.approvalId !== undefined
            ? approved.items.find((i) => i.approvalId === parsed.data.approvalId)
            : approved.items[0];
        if (!item) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "That finished video was not found.",
          });
        }
        const pkg = await getApprovalPackageForClient({
          rawInput: { approvalId: item.approvalId },
          user,
        });
        if (!pkg.ok) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Could not load that finished video.",
          });
        }
        return getReadyVideoDownloadOutputSchema.parse({
          ok: true,
          approvalId: pkg.package.approvalId,
          videoPreviewUrl: pkg.package.video.previewUrl,
          downloadUrl: pkg.package.video.previewUrl,
          ...(pkg.package.cover?.previewUrl
            ? { coverPreviewUrl: pkg.package.cover.previewUrl }
            : {}),
          captionBody: pkg.package.caption.body.slice(0, 2000),
          readyToPublishHref: "/ready-to-publish",
        });
      },
    }),
  };
}

export type OrchestratorTools = ReturnType<typeof createOrchestratorTools>;
