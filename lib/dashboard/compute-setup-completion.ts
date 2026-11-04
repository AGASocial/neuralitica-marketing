import {
  REQUIRED_SETUP_STEP_IDS,
  setupCompletionDtoSchema,
  type SetupCompletionDto,
  type SetupStep,
} from "@/lib/contracts/setup-completion";

export type SetupCompletionFlags = {
  businessProfileDone: boolean;
  interviewDone: boolean;
  visualPreferencesDone: boolean;
  /** Always false until Instagram connect exists in-product. */
  instagramConnected: boolean;
  planApproved: boolean;
  presenterDone: boolean;
};

export function computeSetupCompletion(
  flags: SetupCompletionFlags,
): SetupCompletionDto {
  const steps: SetupStep[] = [
    {
      id: "business_profile",
      done: flags.businessProfileDone,
      required: true,
      ctaKind: "href",
      href: "/profile",
    },
    {
      id: "interview",
      done: flags.interviewDone,
      required: true,
      ctaKind: "href",
      href: "/interview",
    },
    {
      id: "visual_preferences",
      done: flags.visualPreferencesDone,
      required: true,
      ctaKind: "href",
      href: "/settings/preferences",
    },
    {
      id: "instagram_connected",
      done: flags.instagramConnected,
      required: true,
      ctaKind: "open_chat",
    },
    {
      id: "plan_approved",
      done: flags.planApproved,
      required: true,
      ctaKind: "open_chat",
    },
    {
      id: "presenter_avatar",
      done: flags.presenterDone,
      required: false,
      ctaKind: "href",
      href: "/settings/preferences",
    },
  ];

  const requiredTotal = REQUIRED_SETUP_STEP_IDS.length;
  const requiredDone = steps.filter((s) => s.required && s.done).length;
  const percentComplete = Math.round((100 * requiredDone) / requiredTotal);

  return setupCompletionDtoSchema.parse({
    percentComplete,
    requiredDone,
    requiredTotal,
    steps,
  });
}

export function shouldShowSetupCompletionOnHome(
  completion: SetupCompletionDto,
): boolean {
  return completion.percentComplete < 100;
}

/** Instagram Graph connect is not implemented — never mark connected. */
export function isInstagramConnectedInProduct(): false {
  return false;
}
