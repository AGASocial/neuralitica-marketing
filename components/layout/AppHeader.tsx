import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";

import {
  AppNavMenu,
  type AppNavGroup,
  type AppNavLink,
} from "@/components/layout/AppNavMenu";
import { UserMenu } from "@/components/layout/UserMenu";
import { OrchestratorChatPanel } from "@/components/orchestrator-chat/OrchestratorChatPanel";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

type AppHeaderProps = {
  locale: "en" | "es";
  user: CurrentUser;
  suggestedChips: SuggestedPromptChip[];
};

export async function AppHeader({
  locale,
  user,
  suggestedChips,
}: AppHeaderProps) {
  const t = getTranslations(locale);

  const primary: AppNavLink[] = [
    { href: "/dashboard", label: t.header.nav.home },
    { href: "/approvals", label: t.header.nav.myCampaign },
    { href: "/ready-to-publish", label: t.header.nav.myVideos },
  ];

  const groups: AppNavGroup[] = [
    {
      id: "business",
      label: t.header.nav.myBusiness,
      items: [
        { href: "/profile", label: t.header.nav.profile },
        { href: "/settings/preferences", label: t.header.nav.preferences },
        { href: "/settings/automation", label: t.header.nav.automation },
      ],
    },
  ];

  const advancedItems =
    user.role === "operator"
      ? [
          { href: "/operator/strategy", label: t.header.nav.strategy },
          { href: "/operator/scripts", label: t.header.nav.scripts },
          { href: "/operator/calendar", label: t.header.nav.calendar },
          { href: "/operator/playbook", label: t.header.nav.playbook },
          { href: "/operator/trends", label: t.header.nav.trends },
          {
            href: "/operator/settings/cost-policy",
            label: t.header.nav.costPolicy,
          },
          { href: "/operator/cycle", label: t.header.nav.cycle },
        ]
      : [];

  if (advancedItems.length > 0) {
    groups.push({
      id: "advanced",
      label: t.header.nav.advanced,
      items: advancedItems,
    });
  }

  const chatCopy = {
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
    <>
      <header className="sticky top-0 z-40 border-b border-edge bg-deep/95 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="font-display shrink-0 text-2xl text-fog transition-opacity hover:opacity-90 focus-visible:outline-none"
          >
            neuralitica
          </Link>

          <AppNavMenu
            primary={primary}
            groups={groups}
            ariaLabel={t.header.navAriaLabel}
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex lg:gap-2"
            linkClassName="text-sm"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-sm text-dim sm:gap-3">
            <Button
              asChild
              type="button"
              variant="outline"
              size="sm"
              className="border-edge bg-panel text-fog hover:bg-panel/80"
            >
              <Link href="/conversation">
                <MessageSquareIcon className="size-4" aria-hidden />
                <span>{t.orchestratorChat.conversationLabel}</span>
              </Link>
            </Button>
            <UserMenu
              locale={locale}
              displayName={user.displayName}
              email={user.email}
              advancedLinks={
                advancedItems.length > 0
                  ? {
                      label: t.header.nav.advanced,
                      items: advancedItems,
                    }
                  : undefined
              }
              copy={{
                menuAriaLabel: t.header.userMenu.menuAriaLabel,
                languageLabel: t.header.userMenu.languageLabel,
                languageEs: t.header.userMenu.languageEs,
                languageEn: t.header.userMenu.languageEn,
                settings: t.header.userMenu.settings,
                logout: {
                  label: t.header.logout,
                  pendingLabel: t.header.logoutPending,
                  confirmHeader: t.header.confirmHeader,
                  confirmMessage: t.header.confirmMessage,
                  confirmAccept: t.header.confirmAccept,
                  confirmReject: t.header.confirmReject,
                  stayError: t.auth.errors.forbiddenFields,
                },
              }}
            />
          </div>
        </div>
      </header>
      <OrchestratorChatPanel
        copy={chatCopy}
        locale={locale}
        suggestedChips={suggestedChips}
      />
    </>
  );
}
