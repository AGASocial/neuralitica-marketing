import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import {
  authGuardResponse,
  isAuthGuardError,
  requireActive,
} from "@/lib/auth/require-user";
import {
  chatRequestBodySchema,
  orchestratorConversationIdSchema,
  persistOrchestratorChatInputSchema,
} from "@/lib/contracts/orchestrator-chat";
import { resolveChatBodyLocale } from "@/lib/i18n/resolve-request-locale";
import { createOrchestratorTools } from "@/lib/orchestrator-chat/create-tools";
import { getOrchestratorChatModel } from "@/lib/orchestrator-chat/model";
import { toPersistedMessages } from "@/lib/orchestrator-chat/message-mapper";
import { persistConversationMessages } from "@/lib/orchestrator-chat/persistence";
import { extractLatestCardAnchorId } from "@/lib/orchestrator-chat/format-change-prefill";
import { buildOrchestratorSystemPrompt } from "@/lib/orchestrator-chat/system-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const generateMessageId = createIdGenerator({
  prefix: "msg",
  size: 16,
});

export async function POST(request: Request) {
  try {
    const user = await requireActive("handler");
    const rawBody = (await request.json()) as unknown;
    const body = chatRequestBodySchema.parse(
      rawBody && typeof rawBody === "object" ? rawBody : {},
    );
    const messages = (Array.isArray(body.messages) ? body.messages : []) as UIMessage[];
    const locale = resolveChatBodyLocale(body.locale, user.preferredLocale);

    const conversationIdResult = orchestratorConversationIdSchema.safeParse(
      body.id,
    );
    const conversationId = conversationIdResult.success
      ? conversationIdResult.data
      : crypto.randomUUID();

    const onboardingMode = body.onboardingMode === true;
    const tools = createOrchestratorTools(user, locale);
    const cardAnchorId = extractLatestCardAnchorId(
      messages as Array<{ role?: string; metadata?: unknown }>,
    );
    const baseSystem = buildOrchestratorSystemPrompt(user, locale, {
      onboardingMode,
    });
    const system = cardAnchorId
      ? `${baseSystem}\n\nCARD ANCHOR: The owner's Change request refers to card id ${cardAnchorId}. Use this id when calling tools that need the approval/card identity. Do not repeat the raw id to the owner unless they ask.`
      : baseSystem;
    const result = streamText({
      model: getOrchestratorChatModel(),
      system,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: isStepCount(6),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools,
        // flash / reasoning models must never stream CoT to the owner UI
        sendReasoning: false,
        sendSources: false,
        originalMessages: messages,
        generateMessageId,
        onFinish: async ({ messages: finishedMessages }) => {
          try {
            const persisted = toPersistedMessages(finishedMessages);
            const input = persistOrchestratorChatInputSchema.parse({
              conversationId,
              messages: persisted,
            });
            await persistConversationMessages({
              clientId: user.id,
              input,
            });
          } catch (persistError) {
            console.error("[orchestrator-chat] persist on finish failed");
            void persistError;
          }
        },
      }),
    });
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardResponse(error);
    }
    console.error("[orchestrator-chat] POST failed");
    return Response.json(
      { error: { code: "INTERNAL", messageKey: "orchestratorChat.errors.internal" } },
      { status: 500 },
    );
  }
}
