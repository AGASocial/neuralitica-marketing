/**
 * US-6.1 Reel Captions — contracts, mutations, orchestrator, agent.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEffectiveInstagramCaption,
  buildReelCaptionRecord,
  CAPTION_GENERATE_AGENT_KEY,
  computeEffectiveCaptionCharCount,
  IG_CAPTION_MAX_CHARS,
  IG_CTA_SEPARATOR,
  isEffectiveCaptionOverLimit,
  normalizeHashtag,
  reelCaptionAgentOutputSchema,
  resolveSelectedCtaVariant,
  selectReelCaptionCtaInputSchema,
} from "../contracts/reel-caption";
import { VIDEO_SCRIPT_GENERATE_AGENT_KEY } from "../contracts/reel-script";

const WEEK_START = "2026-01-05";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const STRATEGY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const VALID_SLOT = {
  slotIndex: 0,
  dayOfWeek: "monday" as const,
  tema: "Por qué revisar antes del frío",
  goal: "trust" as const,
  formatoPlaybookSlug: "tip-rapido",
  modalidad: "faceless" as const,
};

const VALID_BRIEF = {
  pillars: ["Confianza local"],
  themes: ["Invierno"],
  slots: [
    VALID_SLOT,
    {
      slotIndex: 1,
      dayOfWeek: "wednesday" as const,
      tema: "3 señales de filtro sucio",
      goal: "education" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless" as const,
    },
    {
      slotIndex: 2,
      dayOfWeek: "friday" as const,
      tema: "Oferta revisión",
      goal: "local_sale" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "generic_avatar" as const,
    },
  ],
};

const VALID_SCRIPT_PACKAGE = {
  hook: "¿Tu calefacción falla justo cuando más la necesitas?",
  body: "Antes del primer frío intenso, revisa filtros y termostato.",
  cta: "Guarda este video y agenda tu revisión.",
  onScreenText: "3 checks antes del frío",
  voiceoverText: "Antes del primer frío intenso, revisa estos puntos.",
  targetDurationSec: 30,
};

const VALID_CAPTION_OUTPUT = {
  caption: "Antes del primer frío, revisa estos tres puntos en tu calefacción.",
  hashtags: ["#HVAC", "#Mantenimiento", "#Denver"],
  keywords: ["Denver", "calefacción"],
  ctaVariants: ["Agenda tu revisión hoy.", "Guarda este video y comparte."],
};

const APPROVED_STRATEGY_ROW = {
  id: STRATEGY_ID,
  client_id: OPERATOR_ID,
  week_start: WEEK_START,
  version: 1,
  status: "approved",
  brief: VALID_BRIEF,
  created_at: "2026-01-05T12:00:00.000Z",
  updated_at: "2026-01-05T12:00:00.000Z",
};

const PROFILE_OK = {
  exists: true as const,
  clientId: OPERATOR_ID,
  version: 1,
  fields: {
    preferredLocale: "es",
    tone: { description: "Friendly" },
    zone: { description: "Denver CO" },
  },
  visualModeSummary: {
    allowedModes: ["faceless", "own_avatar", "generic_avatar"] as const,
    mustDiscloseNotOwner: true,
  },
};

const SCRIPT_ROW_0 = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: OPERATOR_ID,
  strategy_id: STRATEGY_ID,
  slot_index: 0,
  updated_at: "2026-01-05T12:00:00.000Z",
  ...VALID_SCRIPT_PACKAGE,
  on_screen_text: VALID_SCRIPT_PACKAGE.onScreenText,
  voiceover_text: VALID_SCRIPT_PACKAGE.voiceoverText,
  target_duration_sec: VALID_SCRIPT_PACKAGE.targetDurationSec,
  modalidad: "faceless",
  must_disclose_not_owner: false,
};

const SCRIPT_ROW_1 = {
  ...SCRIPT_ROW_0,
  id: "22222222-2222-4222-8222-222222222223",
  slot_index: 1,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

const operatorUser = {
  id: OPERATOR_ID,
  email: "operator@example.com",
  displayName: "Operator",
  preferredLocale: "en",
  role: "operator",
  active: true,
};

function clearReelCaptionModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/reel-captions/") ||
      normalized.includes("/lib/reel-scripts/list-reel-scripts-for-week") ||
      normalized.includes("/lib/agents/content/generate-reel-caption") ||
      normalized.includes("/lib/content-strategy/load-approved-strategy-for-week") ||
      normalized.includes("/lib/reel-scripts/persist-reel-script") ||
      normalized.includes("/lib/reel-scripts/list-reel-scripts-for-week") ||
      normalized.includes("/lib/profile/get-business-profile-for-agents") ||
      normalized.includes("/lib/providers/") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function chainableQuery(terminal: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  then?: (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.is = self;
  builder.not = self;
  builder.neq = self;
  builder.in = self;
  builder.gte = self;
  builder.order = self;
  builder.limit = self;
  builder.insert = self;
  builder.update = self;
  builder.upsert = self;
  builder.maybeSingle =
    terminal.maybeSingle ?? (async () => ({ data: null, error: null }));
  builder.single =
    terminal.single ?? (async () => ({ data: null, error: null }));
  if (terminal.then) {
    builder.then = terminal.then;
  } else {
    builder.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  }
  return builder;
}

function strategyQueryBuilder(row: unknown | null, listRows: unknown[] = []) {
  return chainableQuery({
    maybeSingle: async () => ({ data: row, error: null }),
    single: async () => ({ data: row, error: null }),
    then: (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: listRows.length > 0 ? listRows : row ? [row] : [],
        count: listRows.length > 0 ? listRows.length : row ? 1 : 0,
        error: null,
      }).then(onFulfilled, onRejected),
  });
}

function defaultRateLimitFrom() {
  return {
    select: () => strategyQueryBuilder(null),
    insert: () => strategyQueryBuilder(null),
    update: () => strategyQueryBuilder(null),
  };
}

function approvedStrategyFrom(extra?: { status?: string; clientId?: string }) {
  const row =
    extra?.status === "draft"
      ? null
      : {
          ...APPROVED_STRATEGY_ROW,
          status: extra?.status ?? "approved",
          client_id: extra?.clientId ?? OPERATOR_ID,
        };
  return {
    select: () => strategyQueryBuilder(row),
  };
}

function scriptsTableFrom(rows: unknown[]) {
  const terminal = chainableQuery({
    then: (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
    maybeSingle: async () => ({
      data: rows[0] ?? null,
      error: null,
    }),
    single: async () => ({
      data: rows[0] ?? null,
      error: null,
    }),
  });
  return {
    select: () => terminal,
    eq: () => terminal,
    order: () => terminal,
    in: () => terminal,
    maybeSingle: terminal.maybeSingle,
    upsert: () =>
      chainableQuery({
        single: async () => ({
          data: { id: "c1111111-1111-4111-8111-111111111111" },
          error: null,
        }),
      }),
  };
}

const APPROVED_STRATEGY_VIEW = {
  id: STRATEGY_ID,
  clientId: OPERATOR_ID,
  weekStart: WEEK_START,
  version: 1,
  status: "approved" as const,
  brief: VALID_BRIEF,
  createdAt: "2026-01-05T12:00:00.000Z",
  updatedAt: "2026-01-05T12:00:00.000Z",
};

type MockOptions = {
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  from?: (table: string) => unknown;
  getApprovedStrategyForWeek?: (params: {
    clientId: string;
    weekStart: string;
  }) => Promise<unknown>;
  getBusinessProfileForAgents?: (clientId: string) => Promise<unknown>;
  getProviderCatalog?: () => Promise<unknown>;
  getDefaultCostPolicy?: () => Promise<unknown>;
  generateReelCaptionForScript?: (params: unknown) => Promise<unknown>;
  resolveProvider?: (...args: unknown[]) => unknown;
  createSiliconFlowLlmAdapter?: (key: string, env: string) => unknown | null;
  loadApprovedStrategyForScriptJob?: (params: unknown) => Promise<unknown>;
  revalidatePath?: (p: string) => void;
  envKey?: string;
};

function installReelCaptionMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const originalEnv = process.env.SILICONFLOW_API_KEY;
  if (options.envKey !== undefined) {
    process.env.SILICONFLOW_API_KEY = options.envKey;
  }

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request === "next/cache") {
      return {
        revalidatePath: options.revalidatePath ?? (() => {}),
      };
    }
    if (
      request === "@/lib/auth/require-user" ||
      String(request).includes("lib/auth/require-user")
    ) {
      return {
        isAuthGuardError:
          options.isAuthGuardError ??
          ((error: unknown) =>
            Boolean(
              error &&
                typeof error === "object" &&
                "status" in error &&
                ((error as { status: number }).status === 401 ||
                  (error as { status: number }).status === 403),
            )),
        requireOperator:
          options.requireOperator ?? (async () => operatorUser),
      };
    }
    if (
      request === "@/lib/supabase/server" ||
      String(request).includes("lib/supabase/server")
    ) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from:
            options.from ??
            ((table: string) => {
              throw new Error(`unexpected from(${table})`);
            }),
        }),
      };
    }
    if (
      request === "@/lib/content-strategy/load-approved-strategy-for-week" ||
      String(request).includes("load-approved-strategy-for-week")
    ) {
      return {
        getApprovedStrategyForWeek:
          options.getApprovedStrategyForWeek ??
          (async () => APPROVED_STRATEGY_VIEW),
      };
    }
    if (
      request === "@/lib/profile/get-business-profile-for-agents" ||
      String(request).includes("get-business-profile-for-agents")
    ) {
      return {
        getBusinessProfileForAgents:
          options.getBusinessProfileForAgents ?? (async () => PROFILE_OK),
      };
    }
    if (
      request === "@/lib/providers/get-provider-catalog" ||
      String(request).includes("get-provider-catalog")
    ) {
      return {
        getProviderCatalog:
          options.getProviderCatalog ??
          (async () => ({
            providers: [
              {
                key: "siliconflow_deepseek_flash",
                assetRole: "llm",
                tier: "low",
                active: true,
                capabilities: {},
                costModel: { billingUnit: "per_1m_tokens", unitCostCents: 14 },
                envKeyName: "SILICONFLOW_API_KEY",
              },
            ],
          })),
      };
    }
    if (
      request === "@/lib/providers/get-default-cost-policy" ||
      String(request).includes("get-default-cost-policy")
    ) {
      return {
        getDefaultCostPolicy:
          options.getDefaultCostPolicy ??
          (async () => ({
            policy: {
              id: "11111111-1111-4111-8111-111111111111",
              clientId: null,
              providerTier: "low",
              maxCostCents: 5000,
              rules: null,
              createdAt: "2026-08-29T18:00:00.000Z",
              updatedAt: "2026-08-29T18:00:00.000Z",
            },
          })),
      };
    }
    if (
      request === "@/lib/providers/provider-adapters" ||
      String(request).includes("provider-adapters")
    ) {
      const actual = originalLoad(request, parent, isMain) as Record<
        string,
        unknown
      >;
      if (options.resolveProvider) {
        return { ...actual, resolveProvider: options.resolveProvider };
      }
      return actual;
    }
    if (
      request === "@/lib/agents/content/generate-reel-caption" ||
      String(request).includes("/agents/content/generate-reel-caption")
    ) {
      return {
        generateReelCaptionForScript:
          options.generateReelCaptionForScript ??
          (async () => VALID_CAPTION_OUTPUT),
      };
    }
    if (
      request === "@/lib/reel-scripts/load-approved-strategy-for-script-job" ||
      String(request).includes("load-approved-strategy-for-script-job")
    ) {
      return {
        loadApprovedStrategyForScriptJob:
          options.loadApprovedStrategyForScriptJob ??
          (async () => ({
            id: STRATEGY_ID,
            clientId: OPERATOR_ID,
            weekStart: WEEK_START,
            version: 1,
            status: "approved",
            brief: VALID_BRIEF,
          })),
      };
    }
    if (
      request === "@/lib/providers/siliconflow-llm-adapter" ||
      String(request).includes("siliconflow-llm-adapter")
    ) {
      return {
        createSiliconFlowLlmAdapter:
          options.createSiliconFlowLlmAdapter ??
          (() => ({
            providerKey: "siliconflow_deepseek_flash",
            complete: async () => ({ content: "{}" }),
          })),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    if (options.envKey !== undefined) {
      if (originalEnv === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = originalEnv;
      }
    }
    clearReelCaptionModuleCache();
  };
}

function defaultCaptionFrom(scripts: unknown[] = [SCRIPT_ROW_0, SCRIPT_ROW_1]) {
  return (table: string) => {
    if (table === "neuramark_content_strategies") {
      return approvedStrategyFrom();
    }
    if (table === "neuramark_agent_rate_limits") {
      return defaultRateLimitFrom();
    }
    if (table === "neuramark_reel_scripts") {
      return scriptsTableFrom(scripts);
    }
    if (table === "neuramark_reel_captions") {
      return {
        select: () =>
          chainableQuery({
            then: (
              onFulfilled: (v: unknown) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
          }),
        eq: () => chainableQuery({}),
        in: () => chainableQuery({}),
        upsert: () =>
          chainableQuery({
            single: async () => ({
              data: { id: "c1111111-1111-4111-8111-111111111111" },
              error: null,
            }),
          }),
      };
    }
    throw new Error(`unexpected ${table}`);
  };
}

describe("reel caption contracts (US-6.1)", () => {
  it("reelCaptionAgentOutputSchema accepts 2–4 ctaVariants", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse(VALID_CAPTION_OUTPUT).success,
      true,
    );
  });

  it("rejects 1 ctaVariant", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        ctaVariants: ["Solo uno"],
      }).success,
      false,
    );
  });

  it("rejects 5 ctaVariants", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        ctaVariants: ["a", "b", "c", "d", "e"],
      }).success,
      false,
    );
  });

  it("rejects caption over 2200 chars", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        caption: "x".repeat(2201),
      }).success,
      false,
    );
  });

  it("rejects 31 hashtags", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        hashtags: Array.from({ length: 31 }, (_, i) => `#tag${i}`),
      }).success,
      false,
    );
  });

  it("accepts 16 hashtags with hashtagsOverConfiguredMax true in record", () => {
    const output = {
      ...VALID_CAPTION_OUTPUT,
      hashtags: Array.from({ length: 16 }, (_, i) => `#tag${i}`),
    };
    const record = buildReelCaptionRecord(
      reelCaptionAgentOutputSchema.parse(output),
    );
    assert.equal(record.hashtagsOverConfiguredMax, true);
  });

  it("rejects HTML in caption", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        caption: "<script>alert(1)</script>",
      }).success,
      false,
    );
  });

  it("rejects unknown keys via .strict()", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        extra: true,
      }).success,
      false,
    );
  });

  it("rejects 11 keywords", () => {
    assert.equal(
      reelCaptionAgentOutputSchema.safeParse({
        ...VALID_CAPTION_OUTPUT,
        keywords: Array.from({ length: 11 }, (_, i) => `kw${i}`),
      }).success,
      false,
    );
  });

  it("normalizeHashtag adds leading hash", () => {
    assert.equal(normalizeHashtag("HVAC"), "#HVAC");
    assert.equal(normalizeHashtag("#HVAC"), "#HVAC");
  });

  it("generateReelCaptionsInputSchema rejects caption text at action layer", async () => {
    const restore = installReelCaptionMocks({});
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({
        weekStart: WEEK_START,
        caption: "smuggled",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("regenerateReelCaptionInputSchema requires slotIndex", async () => {
    const restore = installReelCaptionMocks({});
    try {
      clearReelCaptionModuleCache();
      const { regenerateReelCaption } = require("./actions/regenerate-reel-caption.ts");
      const result = await regenerateReelCaption({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "VALIDATION_ERROR");
    } finally {
      restore();
    }
  });
});

describe("reel caption mutations (US-6.1)", () => {
  it("non-operator generate returns 403 without LLM or UPSERT", async () => {
    let agentCalled = false;
    let upsertCalled = false;
    const restore = installReelCaptionMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
      generateReelCaptionForScript: async () => {
        agentCalled = true;
        return VALID_CAPTION_OUTPUT;
      },
      from: (table: string) => {
        if (table === "neuramark_reel_captions") {
          return {
            upsert: () => {
              upsertCalled = true;
              return chainableQuery({});
            },
          };
        }
        return defaultCaptionFrom()(table);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
      assert.equal(agentCalled, false);
      assert.equal(upsertCalled, false);
    } finally {
      restore();
    }
  });

  it("no approved strategy returns STRATEGY_NOT_APPROVED", async () => {
    let agentCalled = false;
    const restore = installReelCaptionMocks({
      getApprovedStrategyForWeek: async () => null,
      generateReelCaptionForScript: async () => {
        agentCalled = true;
        return VALID_CAPTION_OUTPUT;
      },
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "STRATEGY_NOT_APPROVED");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("draft strategy only returns STRATEGY_NOT_APPROVED", async () => {
    const restore = installReelCaptionMocks({
      getApprovedStrategyForWeek: async () => null,
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "STRATEGY_NOT_APPROVED");
    } finally {
      restore();
    }
  });

  it("PROFILE_INCOMPLETE when profile missing", async () => {
    let agentCalled = false;
    const restore = installReelCaptionMocks({
      getBusinessProfileForAgents: async () => ({ exists: false }),
      generateReelCaptionForScript: async () => {
        agentCalled = true;
        return VALID_CAPTION_OUTPUT;
      },
      from: defaultCaptionFrom(),
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "PROFILE_INCOMPLETE");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("happy batch 2 scripts with 1 slot pending skip", async () => {
    const upserted: string[] = [];
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return scriptsTableFrom([SCRIPT_ROW_0, SCRIPT_ROW_1]);
        }
        if (table === "neuramark_reel_captions") {
          return {
            select: () => chainableQuery({ then: (fn) => Promise.resolve({ data: [], error: null }).then(fn) }),
            eq: () => chainableQuery({}),
            in: () => chainableQuery({}),
            upsert: (row: { reel_script_id: string }) => {
              upserted.push(row.reel_script_id);
              return chainableQuery({
                single: async () => ({
                  data: { id: `c-${row.reel_script_id.slice(0, 8)}` },
                  error: null,
                }),
              });
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.processedCount, 2);
        assert.equal(result.captionIds.length, 2);
        assert.equal(result.skipped.length, 1);
        assert.equal(result.skipped[0]?.code, "SCRIPT_PENDING");
        assert.equal(result.skipped[0]?.slotIndex, 2);
      }
      assert.equal(upserted.length, 2);
    } finally {
      restore();
    }
  });

  it("slot 0 invalid LLM output collects error while sibling persists", async () => {
    let callCount = 0;
    const upserted: string[] = [];
    const restore = installReelCaptionMocks({
      generateReelCaptionForScript: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { ...VALID_CAPTION_OUTPUT, hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`) };
        }
        return VALID_CAPTION_OUTPUT;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return scriptsTableFrom([SCRIPT_ROW_0, SCRIPT_ROW_1]);
        }
        if (table === "neuramark_reel_captions") {
          return {
            select: () => chainableQuery({ then: (fn) => Promise.resolve({ data: [], error: null }).then(fn) }),
            eq: () => chainableQuery({}),
            in: () => chainableQuery({}),
            upsert: (row: { reel_script_id: string }) => {
              upserted.push(row.reel_script_id);
              return chainableQuery({
                single: async () => ({
                  data: { id: "c2222222-2222-4222-8222-222222222222" },
                  error: null,
                }),
              });
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0]?.slotIndex, 0);
        assert.equal(result.errors[0]?.code, "CAPTION_OUTPUT_INVALID");
        assert.equal(result.processedCount, 1);
      }
      assert.equal(upserted.length, 1);
    } finally {
      restore();
    }
  });

  it("re-run batch UPSERTs refresh", async () => {
    let upsertCount = 0;
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_captions") {
          return {
            select: () => chainableQuery({ then: (fn) => Promise.resolve({ data: [], error: null }).then(fn) }),
            eq: () => chainableQuery({}),
            in: () => chainableQuery({}),
            upsert: () => {
              upsertCount += 1;
              return chainableQuery({
                single: async () => ({
                  data: { id: "c1111111-1111-4111-8111-111111111111" },
                  error: null,
                }),
              });
            },
          };
        }
        return defaultCaptionFrom([SCRIPT_ROW_0])(table);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      await generateReelCaptions({ weekStart: WEEK_START });
      await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(upsertCount, 2);
    } finally {
      restore();
    }
  });

  it("regen no script for slot returns SCRIPT_NOT_FOUND", async () => {
    let agentCalled = false;
    const restore = installReelCaptionMocks({
      generateReelCaptionForScript: async () => {
        agentCalled = true;
        return VALID_CAPTION_OUTPUT;
      },
      from: defaultCaptionFrom([]),
    });
    try {
      clearReelCaptionModuleCache();
      const { regenerateReelCaption } = require("./actions/regenerate-reel-caption.ts");
      const result = await regenerateReelCaption({
        weekStart: WEEK_START,
        slotIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "SCRIPT_NOT_FOUND");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("happy single slot regen UPSERTs one row", async () => {
    let upsertCalled = false;
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_captions") {
          return {
            select: () => chainableQuery({ then: (fn) => Promise.resolve({ data: [], error: null }).then(fn) }),
            eq: () => chainableQuery({}),
            in: () => chainableQuery({}),
            upsert: () => {
              upsertCalled = true;
              return chainableQuery({
                single: async () => ({
                  data: { id: "c1111111-1111-4111-8111-111111111111" },
                  error: null,
                }),
              });
            },
          };
        }
        return defaultCaptionFrom([SCRIPT_ROW_0])(table);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { regenerateReelCaption } = require("./actions/regenerate-reel-caption.ts");
      const result = await regenerateReelCaption({
        weekStart: WEEK_START,
        slotIndex: 0,
      });
      assert.equal(result.ok, true);
      assert.equal(upsertCalled, true);
    } finally {
      restore();
    }
  });

  it("non-operator regen returns 403", async () => {
    const restore = installReelCaptionMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { regenerateReelCaption } = require("./actions/regenerate-reel-caption.ts");
      const result = await regenerateReelCaption({
        weekStart: WEEK_START,
        slotIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
    } finally {
      restore();
    }
  });

  it("resolveProvider called with llmVariant default", async () => {
    let resolveArgs: unknown;
    const restore = installReelCaptionMocks({
      resolveProvider: (_catalog: unknown, ctx: unknown) => {
        resolveArgs = ctx;
        return {
          key: "siliconflow_deepseek_flash",
          assetRole: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_1m_tokens", unitCostCents: 14 },
          envKeyName: "SILICONFLOW_API_KEY",
        };
      },
      from: defaultCaptionFrom([SCRIPT_ROW_0]),
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      await generateReelCaptions({ weekStart: WEEK_START });
      assert.deepEqual(resolveArgs, {
        assetRole: "llm",
        tier: "low",
        llmVariant: "default",
      });
    } finally {
      restore();
    }
  });

  it("caption_generate agent key distinct from video_script_generate", () => {
    assert.notEqual(CAPTION_GENERATE_AGENT_KEY, VIDEO_SCRIPT_GENERATE_AGENT_KEY);
    assert.equal(CAPTION_GENERATE_AGENT_KEY, "caption_generate");
    assert.equal(VIDEO_SCRIPT_GENERATE_AGENT_KEY, "video_script_generate");
  });
});

describe("reel caption helpers (US-6.1)", () => {
  it("loadReelScriptForCaptionJob returns null for draft parent strategy", async () => {
    const restore = installReelCaptionMocks({
      loadApprovedStrategyForScriptJob: async () => null,
      from: (table: string) => {
        if (table === "neuramark_reel_scripts") {
          return scriptsTableFrom([SCRIPT_ROW_0]);
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { loadReelScriptForCaptionJob } = require("./load-reel-script-for-caption-job.ts");
      const result = await loadReelScriptForCaptionJob({
        reelScriptId: SCRIPT_ROW_0.id,
        clientId: OPERATOR_ID,
      });
      assert.equal(result, null);
    } finally {
      restore();
    }
  });

  it("loadReelScriptForCaptionJob returns null for foreign script id", async () => {
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_scripts") {
          return {
            select: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            maybeSingle: async () => ({ data: null, error: null }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { loadReelScriptForCaptionJob } = require("./load-reel-script-for-caption-job.ts");
      const result = await loadReelScriptForCaptionJob({
        reelScriptId: "99999999-9999-4999-8999-999999999999",
        clientId: OPERATOR_ID,
      });
      assert.equal(result, null);
    } finally {
      restore();
    }
  });

  it("five helpers called once per batch job", async () => {
    const counts = { profile: 0, catalog: 0, policy: 0, strategy: 0 };
    const restore = installReelCaptionMocks({
      getBusinessProfileForAgents: async () => {
        counts.profile += 1;
        return PROFILE_OK;
      },
      getProviderCatalog: async () => {
        counts.catalog += 1;
        return {
          providers: [
            {
              key: "siliconflow_deepseek_flash",
              assetRole: "llm",
              tier: "low",
              active: true,
              capabilities: {},
              costModel: { billingUnit: "per_1m_tokens", unitCostCents: 14 },
              envKeyName: "SILICONFLOW_API_KEY",
            },
          ],
        };
      },
      getDefaultCostPolicy: async () => {
        counts.policy += 1;
        return {
          policy: {
            id: "11111111-1111-4111-8111-111111111111",
            clientId: null,
            providerTier: "low",
            maxCostCents: 5000,
            rules: null,
            createdAt: "2026-08-29T18:00:00.000Z",
            updatedAt: "2026-08-29T18:00:00.000Z",
          },
        };
      },
      loadApprovedStrategyForScriptJob: async () => {
        counts.strategy += 1;
        return {
          id: STRATEGY_ID,
          clientId: OPERATOR_ID,
          weekStart: WEEK_START,
          version: 1,
          status: "approved",
          brief: VALID_BRIEF,
        };
      },
      from: defaultCaptionFrom([SCRIPT_ROW_0]),
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptionsForClient } = require("./generate-reel-captions-for-client.ts");
      await generateReelCaptionsForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
        invokedBy: "operator",
        mode: "batch",
      });
      assert.equal(counts.profile, 1);
      assert.equal(counts.catalog, 1);
      assert.equal(counts.policy, 1);
      // Orchestrator + per-script loadReelScriptForCaptionJob verification
      assert.equal(counts.strategy, 2);
    } finally {
      restore();
    }
  });

  it("invokedBy system orchestrator does not call requireOperator", async () => {
    let requireCalled = false;
    const restore = installReelCaptionMocks({
      requireOperator: async () => {
        requireCalled = true;
        return operatorUser;
      },
      from: defaultCaptionFrom([SCRIPT_ROW_0]),
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptionsForClient } = require("./generate-reel-captions-for-client.ts");
      await generateReelCaptionsForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
        invokedBy: "system",
        mode: "batch",
      });
      assert.equal(requireCalled, false);
    } finally {
      restore();
    }
  });

  it("migration enables RLS with zero policies", () => {
    const migrationPath = path.join(
      repoRoot,
      "supabase/migrations/20260830400000_neuramark_reel_captions.sql",
    );
    assert.equal(existsSync(migrationPath), true);
    const sql = readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
    assert.ok(!sql.includes("CREATE POLICY"));
  });
});

const VALID_CAPTION_RECORD = buildReelCaptionRecord(
  reelCaptionAgentOutputSchema.parse(VALID_CAPTION_OUTPUT),
);

const CAPTION_ROW_DB = {
  id: "c1111111-1111-4111-8111-111111111111",
  client_id: OPERATOR_ID,
  reel_script_id: SCRIPT_ROW_0.id,
  caption: VALID_CAPTION_OUTPUT.caption,
  hashtags: VALID_CAPTION_OUTPUT.hashtags,
  keywords: VALID_CAPTION_OUTPUT.keywords,
  cta_variants: VALID_CAPTION_OUTPUT.ctaVariants,
  selected_cta_index: null as number | null,
  updated_at: "2026-01-06T11:00:00.000Z",
};

function captionTableFrom(options?: {
  captionRow?: typeof CAPTION_ROW_DB | null;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onUpsert?: (payload: Record<string, unknown>) => void;
}) {
  const row =
    options && "captionRow" in options ? options.captionRow : CAPTION_ROW_DB;
  return {
    select: () =>
      chainableQuery({
        then: (
          onFulfilled: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: row ? [row] : [],
            error: null,
          }).then(onFulfilled, onRejected),
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      }),
    eq: () => chainableQuery({}),
    in: () => chainableQuery({}),
    update: (payload: Record<string, unknown>) => {
      options?.onUpdate?.(payload);
      return chainableQuery({
        single: async () => ({
          data: {
            updated_at: "2026-01-06T11:30:00.000Z",
          },
          error: null,
        }),
      });
    },
    upsert: (payload: Record<string, unknown>) => {
      options?.onUpsert?.(payload);
      return chainableQuery({
        single: async () => ({
          data: { id: CAPTION_ROW_DB.id },
          error: null,
        }),
      });
    },
  };
}

function selectCaptionFrom(options?: {
  captionRow?: typeof CAPTION_ROW_DB | null;
  onUpdate?: (payload: Record<string, unknown>) => void;
}) {
  return (table: string) => {
    if (table === "neuramark_content_strategies") {
      return approvedStrategyFrom();
    }
    if (table === "neuramark_agent_rate_limits") {
      return defaultRateLimitFrom();
    }
    if (table === "neuramark_reel_scripts") {
      return scriptsTableFrom([SCRIPT_ROW_0]);
    }
    if (table === "neuramark_reel_captions") {
      return captionTableFrom(options);
    }
    throw new Error(`unexpected ${table}`);
  };
}

describe("reel caption CTA selection (US-6.2)", () => {
  it("selectReelCaptionCtaInputSchema accepts valid input", () => {
    assert.equal(
      selectReelCaptionCtaInputSchema.safeParse({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 1,
      }).success,
      true,
    );
  });

  it("selectReelCaptionCtaInputSchema rejects unknown keys", () => {
    assert.equal(
      selectReelCaptionCtaInputSchema.safeParse({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
        extra: true,
      }).success,
      false,
    );
  });

  it("selectReelCaptionCtaInputSchema rejects float selectedCtaIndex", () => {
    assert.equal(
      selectReelCaptionCtaInputSchema.safeParse({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 1.5,
      }).success,
      false,
    );
  });

  it("resolveSelectedCtaVariant returns correct string for index 1", () => {
    assert.equal(
      resolveSelectedCtaVariant(VALID_CAPTION_RECORD, 1),
      VALID_CAPTION_OUTPUT.ctaVariants[1],
    );
  });

  it("resolveSelectedCtaVariant returns null for null index", () => {
    assert.equal(resolveSelectedCtaVariant(VALID_CAPTION_RECORD, null), null);
  });

  it("buildEffectiveInstagramCaption joins caption, CTA, and hashtags", () => {
    const result = buildEffectiveInstagramCaption({
      caption: VALID_CAPTION_OUTPUT.caption,
      selectedCtaText: VALID_CAPTION_OUTPUT.ctaVariants[1]!,
      hashtags: VALID_CAPTION_OUTPUT.hashtags,
    });
    assert.equal(
      result,
      `${VALID_CAPTION_OUTPUT.caption}${IG_CTA_SEPARATOR}${VALID_CAPTION_OUTPUT.ctaVariants[1]}${IG_CTA_SEPARATOR}${VALID_CAPTION_OUTPUT.hashtags.join(" ")}`,
    );
  });

  it("computeEffectiveCaptionCharCount includes separator", () => {
    const count = computeEffectiveCaptionCharCount({
      caption: VALID_CAPTION_OUTPUT.caption,
      selectedCtaText: VALID_CAPTION_OUTPUT.ctaVariants[0]!,
    });
    assert.equal(
      count,
      VALID_CAPTION_OUTPUT.caption.length +
        IG_CTA_SEPARATOR.length +
        VALID_CAPTION_OUTPUT.ctaVariants[0]!.length,
    );
  });

  it("isEffectiveCaptionOverLimit is true at 2201", () => {
    assert.equal(isEffectiveCaptionOverLimit(IG_CAPTION_MAX_CHARS + 1), true);
    assert.equal(isEffectiveCaptionOverLimit(IG_CAPTION_MAX_CHARS), false);
  });

  it("findForbiddenSelectReelCaptionCtaKeys rejects selectedCtaText smuggling", async () => {
    const restore = installReelCaptionMocks({
      from: selectCaptionFrom(),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
        selectedCtaText: "Evil CTA",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("findForbiddenSelectReelCaptionCtaKeys unit rejects ctaVariants", () => {
    const { findForbiddenSelectReelCaptionCtaKeys } = require("./find-forbidden-select-keys.ts");
    const keys = findForbiddenSelectReelCaptionCtaKeys({
      weekStart: WEEK_START,
      slotIndex: 0,
      selectedCtaIndex: 0,
      ctaVariants: ["evil"],
    });
    assert.deepEqual(keys, ["ctaVariants"]);
  });

  it("non-operator select returns 403 without UPDATE", async () => {
    let updateCalled = false;
    const restore = installReelCaptionMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
      from: selectCaptionFrom({
        onUpdate: () => {
          updateCalled = true;
        },
      }),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
      assert.equal(updateCalled, false);
    } finally {
      restore();
    }
  });

  it("select with no caption row returns CAPTION_NOT_FOUND", async () => {
    const restore = installReelCaptionMocks({
      from: selectCaptionFrom({ captionRow: null }),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "CAPTION_NOT_FOUND");
    } finally {
      restore();
    }
  });

  it("select index 99 with 2 variants returns CTA_INDEX_OUT_OF_BOUNDS", async () => {
    let updateCalled = false;
    const restore = installReelCaptionMocks({
      from: selectCaptionFrom({
        onUpdate: () => {
          updateCalled = true;
        },
      }),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 3,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "CTA_INDEX_OUT_OF_BOUNDS");
      }
      assert.equal(updateCalled, false);
    } finally {
      restore();
    }
  });

  it("happy path select index 0 updates index only", async () => {
    let updatePayload: Record<string, unknown> | undefined;
    const restore = installReelCaptionMocks({
      from: selectCaptionFrom({
        onUpdate: (payload) => {
          updatePayload = payload;
        },
      }),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.selectedCtaIndex, 0);
        assert.equal(
          result.selectedCtaText,
          VALID_CAPTION_OUTPUT.ctaVariants[0],
        );
        assert.equal(result.effectiveCaptionOverLimit, false);
      }
      assert.deepEqual(updatePayload, { selected_cta_index: 0 });
      assert.equal("caption" in (updatePayload ?? {}), false);
    } finally {
      restore();
    }
  });

  it("draft strategy select returns STRATEGY_NOT_APPROVED", async () => {
    const restore = installReelCaptionMocks({
      getApprovedStrategyForWeek: async () => null,
      from: selectCaptionFrom(),
    });
    try {
      clearReelCaptionModuleCache();
      const { selectReelCaptionCta } = require("./actions/select-reel-caption-cta.ts");
      const result = await selectReelCaptionCta({
        weekStart: WEEK_START,
        slotIndex: 0,
        selectedCtaIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "STRATEGY_NOT_APPROVED");
    } finally {
      restore();
    }
  });

  it("generate UPSERT resets selected_cta_index to null", async () => {
    let upsertPayload: Record<string, unknown> | undefined;
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_captions") {
          return captionTableFrom({
            onUpsert: (payload) => {
              upsertPayload = payload;
            },
          });
        }
        return defaultCaptionFrom([SCRIPT_ROW_0])(table);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      await generateReelCaptions({ weekStart: WEEK_START });
      assert.equal(upsertPayload?.selected_cta_index, null);
    } finally {
      restore();
    }
  });

  it("regenerate UPSERT resets selected_cta_index to null", async () => {
    let upsertPayload: Record<string, unknown> | undefined;
    const restore = installReelCaptionMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_captions") {
          return captionTableFrom({
            onUpsert: (payload) => {
              upsertPayload = payload;
            },
          });
        }
        return defaultCaptionFrom([SCRIPT_ROW_0])(table);
      },
    });
    try {
      clearReelCaptionModuleCache();
      const { regenerateReelCaption } = require("./actions/regenerate-reel-caption.ts");
      await regenerateReelCaption({
        weekStart: WEEK_START,
        slotIndex: 0,
      });
      assert.equal(upsertPayload?.selected_cta_index, null);
    } finally {
      restore();
    }
  });

  it("generate still forbids selectedCtaIndex on input", async () => {
    const restore = installReelCaptionMocks({});
    try {
      clearReelCaptionModuleCache();
      const { generateReelCaptions } = require("./actions/generate-reel-captions.ts");
      const result = await generateReelCaptions({
        weekStart: WEEK_START,
        selectedCtaIndex: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("buildGeneratedReelCaptionSummary maps selection fields", async () => {
    const restore = installReelCaptionMocks({});
    try {
      clearReelCaptionModuleCache();
      const { buildGeneratedReelCaptionSummary } = require("./persist-reel-caption.ts");
      const summary = buildGeneratedReelCaptionSummary({
        captionRow: {
          id: CAPTION_ROW_DB.id,
          reelScriptId: SCRIPT_ROW_0.id,
          clientId: OPERATOR_ID,
          record: VALID_CAPTION_RECORD,
          selectedCtaIndex: 1,
          updatedAt: CAPTION_ROW_DB.updated_at,
        },
        scriptUpdatedAt: SCRIPT_ROW_0.updated_at,
      });
      assert.equal(summary.selectedCtaIndex, 1);
      assert.equal(summary.selectedCtaText, VALID_CAPTION_OUTPUT.ctaVariants[1]);
      assert.equal(summary.effectiveCaptionCharCount > 0, true);
      assert.equal(summary.effectiveCaptionOverLimit, false);
    } finally {
      restore();
    }
  });

  it("pending caption summary has null selection fields", () => {
    const { PENDING_REEL_CAPTION_SUMMARY } = require("../contracts/reel-caption.ts");
    assert.equal(PENDING_REEL_CAPTION_SUMMARY.selectedCtaIndex, null);
    assert.equal(PENDING_REEL_CAPTION_SUMMARY.selectedCtaText, null);
    assert.equal(PENDING_REEL_CAPTION_SUMMARY.effectiveCaptionCharCount, 0);
    assert.equal(PENDING_REEL_CAPTION_SUMMARY.effectiveCaptionOverLimit, false);
  });
});
