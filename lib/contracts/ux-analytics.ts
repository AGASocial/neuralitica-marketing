import { z } from "zod";

export const UX_EVENT_NAMES = [
  "hoy_visit",
  "hoy_action",
  "chat_first_message",
  "approval",
  "onboarding_step",
] as const;

export type UxEventName = (typeof UX_EVENT_NAMES)[number];

export const uxEventNameSchema = z.enum(UX_EVENT_NAMES);

/** Props are a flat JSON object; nested objects are stringified by the action. */
export const recordUxEventInputSchema = z
  .object({
    event: uxEventNameSchema,
    props: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type RecordUxEventInput = z.infer<typeof recordUxEventInputSchema>;

export const recordUxEventSuccessSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export const recordUxEventErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.enum(["UNAUTHENTICATED", "VALIDATION", "INTERNAL"]),
    message: z.string().optional(),
  })
  .strict();

export type RecordUxEventResult =
  | z.infer<typeof recordUxEventSuccessSchema>
  | z.infer<typeof recordUxEventErrorSchema>;
