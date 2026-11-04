import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  AppNavMenu,
  type AppNavGroup,
  type AppNavLink,
} from "@/components/layout/AppNavMenu";
import {
  OrchestratorChatPanel,
  OrchestratorChatToggle,
} from "@/components/orchestrator-chat/OrchestratorChatPanel";
import { OrchestratorChatProvider } from "@/components/orchestrator-chat/OrchestratorChatContext";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";

type AppHeaderProps = {
  locale: "en" | "es";
  user: CurrentUser;
};

export function AppHeader({ locale, user }: AppHeaderProps) {
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
      ],
    },
  ];

  if (user.role === "operator") {
    groups.push({
      id: "advanced",
      label: t.header.nav.advanced,
      items: [
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
      ],
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
    proposal: {
      title: t.orchestratorChat.proposal.title,
      approve: t.orchestratorChat.proposal.approve,
      changeSomething: t.orchestratorChat.proposal.changeSomething,
      approving: t.orchestratorChat.proposal.approving,
      success: t.orchestratorChat.proposal.success,
      error: t.orchestratorChat.proposal.error,
      spendHint: t.orchestratorChat.proposal.spendHint,
      spendUnknown: t.orchestratorChat.proposal.spendUnknown,
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
  };

  return (
    <OrchestratorChatProvider>
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

          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-dim sm:gap-3">
            <OrchestratorChatToggle
              openLabel={t.orchestratorChat.openLabel}
              shortcutHint={t.orchestratorChat.openShortcutHint}
            />
            <span
              className="hidden max-w-[18rem] truncate lg:inline"
              title={user.email}
            >
              {t.header.signedInAs}{" "}
              <strong className="font-semibold text-fog">
                {user.displayName}
              </strong>
            </span>
            <div
              className="flex size-9 items-center justify-center rounded-full border border-edge bg-panel text-xs font-semibold text-butter"
              aria-hidden
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <LogoutButton
              appearance="header"
              copy={{
                label: t.header.logout,
                pendingLabel: t.header.logoutPending,
                confirmHeader: t.header.confirmHeader,
                confirmMessage: t.header.confirmMessage,
                confirmAccept: t.header.confirmAccept,
                confirmReject: t.header.confirmReject,
                stayError: t.auth.errors.forbiddenFields,
              }}
            />
          </div>
        </div>

        <AppNavMenu
          primary={primary}
          groups={groups}
          ariaLabel={t.header.mobileNavAriaLabel}
          className="flex gap-1 overflow-x-auto border-t border-edge px-4 py-2 md:hidden"
          linkClassName="text-xs"
        />
      </header>
      <OrchestratorChatPanel copy={chatCopy} locale={locale} />
    </OrchestratorChatProvider>
  );
}
