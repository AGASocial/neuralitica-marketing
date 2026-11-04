import { ConversationFullView } from "@/components/orchestrator-chat/ConversationFullView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { loadSuggestedPromptChips } from "@/lib/orchestrator-chat/load-suggested-prompt-chips";

export const dynamic = "force-dynamic";

export default async function ConversationPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  if (!user) {
    throw new Error("Conversation page requires an authenticated user");
  }
  const suggestedChips = await loadSuggestedPromptChips({ user, locale });

  const copy = {
    title: t.orchestratorChat.title,
    description: t.orchestratorChat.description,
    openLabel: t.orchestratorChat.openLabel,
    openShortcutHint: t.orchestratorChat.openShortcutHint,
    closeLabel: t.orchestratorChat.closeLabel,
    placeholder: t.orchestratorChat.placeholder,
    send: t.orchestratorChat.send,
    attach: t.orchestratorChat.attach,
    attaching: t.orchestratorChat.attaching,
    empty: t.orchestratorChat.empty,
    error: t.orchestratorChat.error,
    attachError: t.orchestratorChat.attachError,
    attachedNote: t.orchestratorChat.attachedNote,
    newMessages: t.orchestratorChat.newMessages,
    newConversation: t.orchestratorChat.newConversation,
    loadingConversation: t.orchestratorChat.loadingConversation,
    suggestedPrompts: {
      listAriaLabel: t.orchestratorChat.suggestedPrompts.listAriaLabel,
    },
    proposal: {
      title: t.orchestratorChat.proposal.title,
      approve: t.orchestratorChat.proposal.approve,
      changeSomething: t.orchestratorChat.proposal.changeSomething,
      approving: t.orchestratorChat.proposal.approving,
      success: t.orchestratorChat.proposal.success,
      error: t.orchestratorChat.proposal.error,
      spendHint: t.orchestratorChat.proposal.spendHint,
      spendUnknown: t.orchestratorChat.proposal.spendUnknown,
      stylePresenter: t.orchestratorChat.proposal.stylePresenter,
      styleImages: t.orchestratorChat.proposal.styleImages,
      styleVoice: t.orchestratorChat.proposal.styleVoice,
      pickVideo: t.orchestratorChat.proposal.pickVideo,
      videoOption: t.orchestratorChat.proposal.videoOption,
    },
    status: {
      campaignTitle: t.orchestratorChat.status.campaignTitle,
      planTitle: t.orchestratorChat.status.planTitle,
      scriptsTitle: t.orchestratorChat.status.scriptsTitle,
      pendingVideos: t.orchestratorChat.status.pendingVideos,
      readyVideos: t.orchestratorChat.status.readyVideos,
      planNone: t.orchestratorChat.status.planNone,
      planDraft: t.orchestratorChat.status.planDraft,
      planApproved: t.orchestratorChat.status.planApproved,
      planUnknown: t.orchestratorChat.status.planUnknown,
      noPlan: t.orchestratorChat.status.noPlan,
      videosLabel: t.orchestratorChat.status.videosLabel,
      scriptsReady: t.orchestratorChat.status.scriptsReady,
      scriptsWaiting: t.orchestratorChat.status.scriptsWaiting,
      emptyScripts: t.orchestratorChat.status.emptyScripts,
    },
    preview: {
      videoTitle: t.orchestratorChat.preview.videoTitle,
      scriptTitle: t.orchestratorChat.preview.scriptTitle,
      captionLabel: t.orchestratorChat.preview.captionLabel,
      hookLabel: t.orchestratorChat.preview.hookLabel,
      bodyLabel: t.orchestratorChat.preview.bodyLabel,
      ctaLabel: t.orchestratorChat.preview.ctaLabel,
      playHint: t.orchestratorChat.preview.playHint,
      changeSomething: t.orchestratorChat.proposal.changeSomething,
      pendingScript: t.orchestratorChat.preview.pendingScript,
    },
    progress: {
      title: t.orchestratorChat.progress.title,
      nextLabel: t.orchestratorChat.progress.nextLabel,
      openInterview: t.orchestratorChat.progress.openInterview,
      openReady: t.orchestratorChat.progress.openReady,
      stepInterview: t.orchestratorChat.progress.stepInterview,
      stepPlan: t.orchestratorChat.progress.stepPlan,
      stepScripts: t.orchestratorChat.progress.stepScripts,
      stepVideos: t.orchestratorChat.progress.stepVideos,
      stepApprove: t.orchestratorChat.progress.stepApprove,
      stepReady: t.orchestratorChat.progress.stepReady,
      statusTodo: t.orchestratorChat.progress.statusTodo,
      statusCurrent: t.orchestratorChat.progress.statusCurrent,
      statusDone: t.orchestratorChat.progress.statusDone,
    },
    interview: {
      title: t.orchestratorChat.interview.title,
      progress: t.orchestratorChat.interview.progress,
      completed: t.orchestratorChat.interview.completed,
      readyToSubmit: t.orchestratorChat.interview.readyToSubmit,
      listHint: t.orchestratorChat.interview.listHint,
      textHint: t.orchestratorChat.interview.textHint,
    },
    download: {
      title: t.orchestratorChat.download.title,
      hint: t.orchestratorChat.download.hint,
      download: t.orchestratorChat.download.download,
      openReady: t.orchestratorChat.download.openReady,
      noIg: t.orchestratorChat.download.noIg,
    },
  };

  return (
    <ConversationFullView
      copy={copy}
      locale={locale}
      suggestedChips={suggestedChips}
      pageTitle={t.orchestratorChat.conversationLabel}
      canvasTitle={t.orchestratorChat.canvasTitle}
    />
  );
}
