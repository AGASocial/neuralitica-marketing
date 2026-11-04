import {
  convertToModelMessages,
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
import { createOrchestratorTools } from "@/lib/orchestrator-chat/create-tools";
import { getOrchestratorChatModel } from "@/lib/orchestrator-chat/model";
import { buildOrchestratorSystemPrompt } from "@/lib/orchestrator-chat/system-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireActive("handler");
    const body = (await request.json()) as { messages?: UIMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const tools = createOrchestratorTools(user);
    const result = streamText({
      model: getOrchestratorChatModel(),
      system: buildOrchestratorSystemPrompt(user),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: isStepCount(6),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools,
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
