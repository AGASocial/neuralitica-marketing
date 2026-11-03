import "server-only";

import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmProviderAdapter,
} from "@/lib/providers/provider-adapters";
import type { ProviderCatalogRow } from "@/lib/contracts/providers";
import { computeLlmActualCost } from "@/lib/cost-policy/compute-llm-actual-cost";

/** Vercel AI Gateway OpenAI-compatible chat endpoint. */
export const AI_GATEWAY_CHAT_URL =
  "https://ai-gateway.vercel.sh/v1/chat/completions";

/** Catalog key prefix routed through Vercel AI Gateway. */
export const AI_GATEWAY_LLM_KEY_PREFIX = "ai_gateway_";

/** Default gateway model when the catalog row omits `costModel.metadata.gatewayModel`. */
export const AI_GATEWAY_DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

/** Per-request timeout so a slow vendor cannot hold the script lock for minutes. */
export const AI_GATEWAY_REQUEST_TIMEOUT_MS = 60_000;

export function isAiGatewayLlmKey(providerKey: string): boolean {
  return providerKey.startsWith(AI_GATEWAY_LLM_KEY_PREFIX);
}

export function resolveAiGatewayModel(row: Pick<ProviderCatalogRow, "costModel">): string {
  const raw = row.costModel.metadata?.gatewayModel;
  return typeof raw === "string" && raw.includes("/") ? raw : AI_GATEWAY_DEFAULT_MODEL;
}

export class AiGatewayLlmAdapter implements LlmProviderAdapter {
  constructor(
    readonly providerKey: string,
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async estimateCost(): Promise<{
    estimatedCostCents: number;
    currency: "USD";
    providerKey: string;
  }> {
    return { estimatedCostCents: 1, currency: "USD", providerKey: this.providerKey };
  }

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    let response: Response;
    try {
      response = await fetch(AI_GATEWAY_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: input.userPrompt },
          ],
          temperature: 0.3,
          ...(typeof input.maxTokens === "number"
            ? { max_tokens: input.maxTokens }
            : {}),
          response_format: input.structuredOutputSchema
            ? { type: "json_object" }
            : undefined,
        }),
        signal: AbortSignal.timeout(AI_GATEWAY_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error("[llm] ai gateway request error", {
        providerKey: this.providerKey,
        model: this.model,
        clientId: input.clientId,
        code: error instanceof Error ? error.name : "unknown",
      });
      throw new Error("LLM request failed");
    }

    if (!response.ok) {
      console.error("[llm] ai gateway request failed", {
        providerKey: this.providerKey,
        model: this.model,
        status: response.status,
        clientId: input.clientId,
      });
      throw new Error("LLM request failed");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error("LLM empty response");
    }

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const costResult = await computeLlmActualCost({
      providerKey: this.providerKey,
      inputTokens,
      outputTokens,
      adapterReportedCents: 0,
    });

    return {
      content: content.trim(),
      inputTokens,
      outputTokens,
      actualCostCents: costResult.ok ? costResult.actualCostCents : 0,
    };
  }
}

export function createAiGatewayLlmAdapter(
  row: Pick<ProviderCatalogRow, "key" | "envKeyName" | "costModel">,
): LlmProviderAdapter | null {
  const apiKey = process.env[row.envKeyName]?.trim();
  if (!apiKey) {
    console.error("[llm] provider key missing", {
      providerKey: row.key,
      envKeyName: row.envKeyName,
    });
    return null;
  }
  return new AiGatewayLlmAdapter(row.key, apiKey, resolveAiGatewayModel(row));
}
