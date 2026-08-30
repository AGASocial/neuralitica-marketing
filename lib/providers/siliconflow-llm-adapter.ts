import "server-only";

import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmProviderAdapter,
} from "@/lib/providers/provider-adapters";

const SILICONFLOW_CHAT_URL =
  "https://api.siliconflow.cn/v1/chat/completions";

type SiliconFlowModelMap = Record<string, string>;

const DEFAULT_MODEL_BY_KEY: SiliconFlowModelMap = {
  siliconflow_deepseek_flash: "deepseek-ai/DeepSeek-V3",
  siliconflow_qwen: "Qwen/Qwen2.5-7B-Instruct",
};

function resolveModel(providerKey: string): string {
  return DEFAULT_MODEL_BY_KEY[providerKey] ?? "deepseek-ai/DeepSeek-V3";
}

function extractJsonContent(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

export class SiliconFlowLlmAdapter implements LlmProviderAdapter {
  readonly providerKey: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(providerKey: string, apiKey: string) {
    this.providerKey = providerKey;
    this.apiKey = apiKey;
    this.model = resolveModel(providerKey);
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
    const response = await fetch(SILICONFLOW_CHAT_URL, {
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
      console.error("[llm] siliconflow request failed", {
        providerKey: this.providerKey,
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

    return {
      content: extractJsonContent(content),
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      actualCostCents: 0,
    };
  }
}

export function createSiliconFlowLlmAdapter(
  providerKey: string,
  envKeyName: string,
): LlmProviderAdapter | null {
  const apiKey = process.env[envKeyName];
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }
  return new SiliconFlowLlmAdapter(providerKey, apiKey);
}
