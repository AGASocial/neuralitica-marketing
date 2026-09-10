import "server-only";

import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmProviderAdapter,
} from "@/lib/providers/provider-adapters";
import { computeLlmActualCost } from "@/lib/cost-policy/compute-llm-actual-cost";

const SILICONFLOW_CHAT_URL =
  "https://api.siliconflow.cn/v1/chat/completions";

const AI_GATEWAY_CHAT_URL =
  "https://ai-gateway.vercel.sh/v1/chat/completions";

const AI_GATEWAY_ENV_KEY = "AI_GATEWAY_API_KEY";

type SiliconFlowModelMap = Record<string, string>;

/** Native SiliconFlow OpenAI-compatible model ids. */
const SILICONFLOW_MODEL_BY_KEY: SiliconFlowModelMap = {
  siliconflow_deepseek_flash: "deepseek-ai/DeepSeek-V3",
  siliconflow_qwen: "Qwen/Qwen2.5-7B-Instruct",
};

/**
 * Vercel AI Gateway model ids used when SILICONFLOW_API_KEY is unset
 * but AI_GATEWAY_API_KEY is configured (production default today).
 */
const AI_GATEWAY_MODEL_BY_KEY: SiliconFlowModelMap = {
  siliconflow_deepseek_flash: "deepseek/deepseek-v3.2",
  siliconflow_qwen: "alibaba/qwen3.5-flash",
};

type LlmBackend = {
  apiKey: string;
  chatUrl: string;
  model: string;
  transport: "siliconflow" | "ai_gateway";
};

function extractJsonContent(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function resolveBackend(
  providerKey: string,
  envKeyName: string,
): LlmBackend | null {
  const siliconKey = process.env[envKeyName]?.trim();
  if (siliconKey) {
    return {
      apiKey: siliconKey,
      chatUrl: SILICONFLOW_CHAT_URL,
      model:
        SILICONFLOW_MODEL_BY_KEY[providerKey] ?? "deepseek-ai/DeepSeek-V3",
      transport: "siliconflow",
    };
  }

  const gatewayKey = process.env[AI_GATEWAY_ENV_KEY]?.trim();
  const gatewayModel = AI_GATEWAY_MODEL_BY_KEY[providerKey];
  if (gatewayKey && gatewayModel) {
    return {
      apiKey: gatewayKey,
      chatUrl: AI_GATEWAY_CHAT_URL,
      model: gatewayModel,
      transport: "ai_gateway",
    };
  }

  return null;
}

export class SiliconFlowLlmAdapter implements LlmProviderAdapter {
  readonly providerKey: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly chatUrl: string;
  private readonly transport: LlmBackend["transport"];

  constructor(providerKey: string, backend: LlmBackend) {
    this.providerKey = providerKey;
    this.apiKey = backend.apiKey;
    this.model = backend.model;
    this.chatUrl = backend.chatUrl;
    this.transport = backend.transport;
  }

  async estimateCost(): Promise<{
    estimatedCostCents: number;
    currency: "USD";
    providerKey: string;
  }> {
    return {
      estimatedCostCents: 1,
      currency: "USD",
      providerKey: this.providerKey,
    };
  }

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const response = await fetch(this.chatUrl, {
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
        temperature: 0.4,
        response_format: input.structuredOutputSchema
          ? { type: "json_object" }
          : undefined,
      }),
    });

    if (!response.ok) {
      console.error("[llm] chat request failed", {
        providerKey: this.providerKey,
        transport: this.transport,
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
      content: extractJsonContent(content),
      inputTokens,
      outputTokens,
      actualCostCents: costResult.ok ? costResult.actualCostCents : 0,
    };
  }
}

/**
 * Builds the LLM adapter for catalog SiliconFlow keys.
 * Prefers `envKeyName` (SILICONFLOW_API_KEY). Falls back to
 * AI_GATEWAY_API_KEY + Vercel AI Gateway when SiliconFlow is unset.
 */
export function createSiliconFlowLlmAdapter(
  providerKey: string,
  envKeyName: string,
): LlmProviderAdapter | null {
  const backend = resolveBackend(providerKey, envKeyName);
  if (!backend) {
    console.error("[llm] provider key missing", {
      providerKey,
      envKeyName,
      aiGatewayConfigured: Boolean(process.env[AI_GATEWAY_ENV_KEY]?.trim()),
    });
    return null;
  }

  if (backend.transport === "ai_gateway") {
    console.info("[llm] using AI Gateway fallback", { providerKey });
  }

  return new SiliconFlowLlmAdapter(providerKey, backend);
}
