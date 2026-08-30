/**
 * US-5.1 Reel Scripts — contracts, mutations, orchestrator, agent.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  reelScriptPackageSchema,
} from "../contracts/reel-script";

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
  tacticaTendenciaSlug: "cold-open-mejor-toma" as const,
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
  brollBeats: ["Plano manos abriendo panel"],
  coldOpenNotes: "Abrir con la toma más impactante.",
  editingNotes: "Corte rápido entre checks.",
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
  },
  visualModeSummary: {
    allowedModes: ["faceless", "own_avatar", "generic_avatar"] as const,
    mustDiscloseNotOwner: true,
  },
};

const PLAYBOOK_OK = {
  formats: [
    {
      slug: "tip-rapido",
      titulo: "Tip rápido",
      explicacion: "Consejo rápido",
      estructura: ["Hook"],
      hookType: "quick_tip" as const,
      duracionIdealSeg: 25,
      modalidadesRecomendadas: ["faceless"] as const,
      rubros: [] as const,
      guionHints: ["Usa un tip concreto del rubro"],
      editingHints: ["Cold open con la mejor toma"],
      ctaTipo: "save" as const,
    },
  ],
};

const TREND_OK = {
  weekStart: WEEK_START,
  entries: [
    {
      slug: "cold-open-mejor-toma",
      titulo: "Cold open",
      weekStart: WEEK_START,
      prioridadSemana: 3,
      fuente: "manual" as const,
      explicacion: "Abrir fuerte",
      hookType: "before_after_tease" as const,
      estructura: ["Cold open"],
      guionHints: ["Impacto visual inmediato"],
      editingHints: ["Rewind 2s al inicio"],
      duracionIdealSeg: { cold_open: 3, total: 30 },
      modalidadesRecomendadas: ["faceless"] as const,
      rubros: [] as const,
      formatosPlaybookCompatibles: ["tip-rapido"],
    },
  ],
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

function clearReelScriptModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/reel-scripts/") ||
      normalized.includes("/lib/reel-captions/") ||
      normalized.includes("/lib/agents/content/generate-reel-script") ||
      normalized.includes("/lib/content-strategy/load-approved-strategy-for-week") ||
      normalized.includes("/lib/content-strategy/strategy-has-scripts") ||
      normalized.includes("/lib/profile/get-business-profile-for-agents") ||
      normalized.includes("/lib/playbook/get-playbook-for-agents") ||
      normalized.includes("/lib/trend/get-trend-snapshot-for-week") ||
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
  const chain = strategyQueryBuilder(null);
  return {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
  };
}

type MockOptions = {
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  from?: (table: string) => unknown;
  getBusinessProfileForAgents?: (clientId: string) => Promise<unknown>;
  getPlaybookForAgents?: () => Promise<unknown>;
  getTrendSnapshotForWeek?: (weekStart: string) => Promise<unknown>;
  getProviderCatalog?: () => Promise<unknown>;
  getDefaultCostPolicy?: () => Promise<unknown>;
  getCostPolicyForClient?: (clientId: string) => Promise<unknown>;
  assertReelBudgetAllowsSpend?: (input: unknown) => Promise<unknown>;
  recordReelSpendEvent?: (params: unknown) => Promise<void>;
  resolveReelScriptBudgetContext?: (params: unknown) => Promise<unknown>;
  generateReelScriptForSlot?: (params: unknown) => Promise<unknown>;
  resolveProvider?: (...args: unknown[]) => unknown;
  createSiliconFlowLlmAdapter?: (key: string, env: string) => unknown | null;
  revalidatePath?: (p: string) => void;
  envKey?: string;
};

function withServerOnlyStub<T>(run: () => T | Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return Promise.resolve(run()).finally(() => {
    nodeModule._load = originalLoad;
  });
}

function installReelScriptMocks(options: MockOptions) {
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
      request === "@/lib/profile/get-business-profile-for-agents" ||
      String(request).includes("get-business-profile-for-agents")
    ) {
      return {
        getBusinessProfileForAgents:
          options.getBusinessProfileForAgents ?? (async () => PROFILE_OK),
      };
    }
    if (
      request === "@/lib/playbook/get-playbook-for-agents" ||
      String(request).includes("get-playbook-for-agents")
    ) {
      return {
        getPlaybookForAgents:
          options.getPlaybookForAgents ?? (async () => PLAYBOOK_OK),
      };
    }
    if (
      request === "@/lib/trend/get-trend-snapshot-for-week" ||
      String(request).includes("get-trend-snapshot-for-week")
    ) {
      return {
        getTrendSnapshotForWeek:
          options.getTrendSnapshotForWeek ?? (async () => TREND_OK),
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
                key: "siliconflow_qwen",
                assetRole: "llm",
                tier: "low",
                active: true,
                capabilities: {},
                costModel: {
                  billingUnit: "per_1m_tokens",
                  unitCostCents: 14,
                },
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
    if (String(request).includes("lib/cost-policy/get-cost-policy-for-client")) {
      return {
        getCostPolicyForClient:
          options.getCostPolicyForClient ??
          (async () => ({
            ok: true,
            scope: "global",
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
    if (String(request).includes("lib/cost-policy/assert-reel-budget-allows-spend")) {
      return {
        assertReelBudgetAllowsSpend:
          options.assertReelBudgetAllowsSpend ??
          (async () => ({
            ok: true,
            estimatedCostCents: 1,
            cumulativeCostCents: 0,
            maxCostCents: 5000,
            providerTier: "low",
            providerKey: "siliconflow_qwen",
            didOverride: false,
          })),
      };
    }
    if (String(request).includes("lib/cost-policy/record-reel-spend-event")) {
      return {
        recordReelSpendEvent: options.recordReelSpendEvent ?? (async () => {}),
      };
    }
    if (String(request).includes("lib/cost-policy/resolve-reel-script-for-budget")) {
      return {
        resolveReelScriptBudgetContext:
          options.resolveReelScriptBudgetContext ??
          (async () => ({
            reelScriptId: "11111111-1111-4111-8111-111111111111",
            persisted: false,
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
      request === "@/lib/agents/content/generate-reel-script" ||
      (String(request).includes("/agents/content/generate-reel-script") &&
        !String(request).includes("generate-reel-scripts"))
    ) {
      return {
        generateReelScriptForSlot:
          options.generateReelScriptForSlot ??
          (async () => VALID_SCRIPT_PACKAGE),
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
            providerKey: "siliconflow_qwen",
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
    clearReelScriptModuleCache();
  };
}

function approvedStrategyFrom(extra?: {
  status?: string;
  clientId?: string;
}) {
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

describe("reel script contracts (US-5.1)", () => {
  it("reelScriptPackageSchema accepts full package with optional beats/notes", () => {
    assert.equal(
      reelScriptPackageSchema.safeParse(VALID_SCRIPT_PACKAGE).success,
      true,
    );
  });

  it("rejects targetDurationSec out of range", () => {
    assert.equal(
      reelScriptPackageSchema.safeParse({
        ...VALID_SCRIPT_PACKAGE,
        targetDurationSec: 10,
      }).success,
      false,
    );
    assert.equal(
      reelScriptPackageSchema.safeParse({
        ...VALID_SCRIPT_PACKAGE,
        targetDurationSec: 50,
      }).success,
      false,
    );
  });

  it("rejects empty hook/body/cta", () => {
    for (const key of ["hook", "body", "cta"] as const) {
      assert.equal(
        reelScriptPackageSchema.safeParse({
          ...VALID_SCRIPT_PACKAGE,
          [key]: "   ",
        }).success,
        false,
      );
    }
  });

  it("rejects unknown keys via .strict()", () => {
    assert.equal(
      reelScriptPackageSchema.safeParse({
        ...VALID_SCRIPT_PACKAGE,
        modalidad: "faceless",
      }).success,
      false,
    );
  });

  it("rejects brollBeats over 8 items", () => {
    assert.equal(
      reelScriptPackageSchema.safeParse({
        ...VALID_SCRIPT_PACKAGE,
        brollBeats: Array.from({ length: 9 }, (_, i) => `beat ${i}`),
      }).success,
      false,
    );
  });

  it("generateReelScriptsInputSchema rejects strategyId at action layer", async () => {
    const restore = installReelScriptMocks({});
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("regenerateReelScriptSlotInputSchema requires slotIndex", async () => {
    const restore = installReelScriptMocks({});
    try {
      clearReelScriptModuleCache();
      const { regenerateReelScriptSlot } = require("./actions/regenerate-reel-script-slot.ts");
      const result = await regenerateReelScriptSlot({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "VALIDATION_ERROR");
    } finally {
      restore();
    }
  });
});

describe("reel script mutations (US-5.1)", () => {
  it("non-operator generate returns 403 without LLM or UPSERT", async () => {
    let agentCalled = false;
    let upsertCalled = false;
    const restore = installReelScriptMocks({
      requireOperator: async () => {
        const err = Object.assign(new Error("forbidden"), { status: 403 });
        throw err;
      },
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: () => {
              upsertCalled = true;
              return chainableQuery({});
            },
          };
        }
        return approvedStrategyFrom();
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
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
    const restore = installReelScriptMocks({
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            eq: () => chainableQuery({}),
            order: () => chainableQuery({}),
            limit: () => chainableQuery({}),
          };
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "STRATEGY_NOT_APPROVED");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("draft strategy only returns STRATEGY_NOT_APPROVED", async () => {
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom({ status: "draft" });
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "STRATEGY_NOT_APPROVED");
    } finally {
      restore();
    }
  });

  it("PROFILE_INCOMPLETE when no visualModeSummary", async () => {
    let agentCalled = false;
    const restore = installReelScriptMocks({
      getBusinessProfileForAgents: async () => ({
        ...PROFILE_OK,
        visualModeSummary: null,
      }),
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "PROFILE_INCOMPLETE");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("happy batch 3 slots UPSERTs all", async () => {
    const upserted: number[] = [];
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: (row: { slot_index: number }) => {
              upserted.push(row.slot_index);
              return chainableQuery({
                single: async () => ({
                  data: {
                    id: `11111111-1111-4111-8111-11111111111${row.slot_index}`,
                  },
                  error: null,
                }),
              });
            },
            select: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            order: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.slotCount, 3);
        assert.equal(result.scriptIds.length, 3);
      }
      assert.deepEqual(upserted.sort(), [0, 1, 2]);
    } finally {
      restore();
    }
  });

  it("slot 2 invalid LLM output returns SCRIPT_OUTPUT_INVALID without UPSERT", async () => {
    let upsertCalled = false;
    let callCount = 0;
    const restore = installReelScriptMocks({
      generateReelScriptForSlot: async () => {
        callCount += 1;
        if (callCount === 2) {
          return { ...VALID_SCRIPT_PACKAGE, targetDurationSec: 99 };
        }
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: () => {
              upsertCalled = true;
              return chainableQuery({});
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "SCRIPT_OUTPUT_INVALID");
        assert.ok(result.error.fields?.slotIndex);
      }
      assert.equal(upsertCalled, false);
    } finally {
      restore();
    }
  });

  it("invalid slotIndex returns SLOT_NOT_FOUND", async () => {
    let agentCalled = false;
    const restore = installReelScriptMocks({
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { regenerateReelScriptSlot } = require("./actions/regenerate-reel-script-slot.ts");
      const result = await regenerateReelScriptSlot({
        weekStart: WEEK_START,
        slotIndex: 6,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "SLOT_NOT_FOUND");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("happy single slot regen UPSERTs one row", async () => {
    const upserted: number[] = [];
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: (row: { slot_index: number }) => {
              upserted.push(row.slot_index);
              return chainableQuery({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
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
      clearReelScriptModuleCache();
      const { regenerateReelScriptSlot } = require("./actions/regenerate-reel-script-slot.ts");
      const result = await regenerateReelScriptSlot({
        weekStart: WEEK_START,
        slotIndex: 1,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(upserted, [1]);
    } finally {
      restore();
    }
  });

  it("non-operator read returns 403", async () => {
    const restore = installReelScriptMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    });
    try {
      clearReelScriptModuleCache();
      const { getReelScriptsForWeek } = require("./actions/get-reel-scripts-for-week.ts");
      const result = await getReelScriptsForWeek({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
    } finally {
      restore();
    }
  });

  it("approved no scripts returns pending items from brief", async () => {
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            select: () =>
              chainableQuery({
                then: (onFulfilled: (v: unknown) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            eq: () => chainableQuery({}),
            order: () => chainableQuery({}),
            neq: () => chainableQuery({}),
            in: () => chainableQuery({}),
          };
        }
        if (table === "neuramark_reel_captions") {
          return {
            select: () =>
              chainableQuery({
                then: (onFulfilled: (v: unknown) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            eq: () => chainableQuery({}),
            in: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { getReelScriptsForWeek } = require("./actions/get-reel-scripts-for-week.ts");
      const result = await getReelScriptsForWeek({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.items.length, 3);
        assert.ok(result.items.every((i) => i.status === "pending"));
        assert.ok(result.approvedStrategy);
      }
    } finally {
      restore();
    }
  });

  it("mustDiscloseNotOwner true for generic_avatar slot when profile flag true", async () => {
    let persistedDisclosure: boolean | null = null;
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: (row: { must_disclose_not_owner: boolean; slot_index: number }) => {
              if (row.slot_index === 2) {
                persistedDisclosure = row.must_disclose_not_owner;
              }
              return chainableQuery({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
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
      clearReelScriptModuleCache();
      const { regenerateReelScriptSlot } = require("./actions/regenerate-reel-script-slot.ts");
      await regenerateReelScriptSlot({ weekStart: WEEK_START, slotIndex: 2 });
      assert.equal(persistedDisclosure, true);
    } finally {
      restore();
    }
  });

  it("mustDiscloseNotOwner false for faceless slot even when profile flag true", async () => {
    let persistedDisclosure: boolean | null = null;
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: (row: { must_disclose_not_owner: boolean; slot_index: number }) => {
              if (row.slot_index === 0) {
                persistedDisclosure = row.must_disclose_not_owner;
              }
              return chainableQuery({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
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
      clearReelScriptModuleCache();
      const { regenerateReelScriptSlot } = require("./actions/regenerate-reel-script-slot.ts");
      await regenerateReelScriptSlot({ weekStart: WEEK_START, slotIndex: 0 });
      assert.equal(persistedDisclosure, false);
    } finally {
      restore();
    }
  });

  it("request mustDiscloseNotOwner returns FORBIDDEN_FIELDS", async () => {
    const restore = installReelScriptMocks({});
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({
        weekStart: WEEK_START,
        mustDiscloseNotOwner: false,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("resolveProvider called with llmVariant fallback", async () => {
    let resolveArgs: unknown;
    const restore = installReelScriptMocks({
      resolveProvider: (_catalog: unknown, ctx: unknown) => {
        resolveArgs = ctx;
        return {
          key: "siliconflow_qwen",
          assetRole: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_1m_tokens", unitCostCents: 14 },
          envKeyName: "SILICONFLOW_API_KEY",
        };
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: () =>
              chainableQuery({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
                  error: null,
                }),
              }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScriptsForClient } = require("./generate-reel-scripts-for-client.ts");
      await generateReelScriptsForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
        invokedBy: "operator",
        mode: "slot",
        slotIndex: 0,
      });
      assert.deepEqual(resolveArgs, {
        assetRole: "llm",
        tier: "low",
        llmVariant: "fallback",
      });
    } finally {
      restore();
    }
  });

  it("6th job in 60 min returns RATE_LIMITED", async () => {
    let agentCalled = false;
    const restore = installReelScriptMocks({
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (onFulfilled: (v: unknown) => unknown) =>
                  Promise.resolve({
                    data: [{ attempt_count: 5, window_start: new Date().toISOString() }],
                    error: null,
                  }).then(onFulfilled),
              }),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "RATE_LIMITED");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("concurrent batch returns GENERATION_IN_FLIGHT", async () => {
    let agentCalled = false;
    let selectCallCount = 0;
    const restore = installReelScriptMocks({
      generateReelScriptForSlot: async () => {
        agentCalled = true;
        return VALID_SCRIPT_PACKAGE;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
                  const call = selectCallCount;
                  selectCallCount += 1;
                  if (call === 0) {
                    return Promise.resolve({
                      data: [
                        {
                          in_flight_key: `${OPERATOR_ID}:${STRATEGY_ID}:batch`,
                          in_flight_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    }).then(onFulfilled, onRejected);
                  }
                  return Promise.resolve({ data: [], error: null }).then(
                    onFulfilled,
                    onRejected,
                  );
                },
              }),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "GENERATION_IN_FLIGHT");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("request hook text returns FORBIDDEN_FIELDS", async () => {
    const restore = installReelScriptMocks({});
    try {
      clearReelScriptModuleCache();
      const { generateReelScripts } = require("./actions/generate-reel-scripts.ts");
      const result = await generateReelScripts({
        weekStart: WEEK_START,
        hook: "injected",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });
});

describe("reel script helpers (US-5.1)", () => {
  it("loadApprovedStrategyForScriptJob returns null for draft", async () => {
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom({ status: "draft" });
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { loadApprovedStrategyForScriptJob } = require("./load-approved-strategy-for-script-job.ts");
      const row = await loadApprovedStrategyForScriptJob({
        strategyId: STRATEGY_ID,
        clientId: OPERATOR_ID,
      });
      assert.equal(row, null);
    } finally {
      restore();
    }
  });

  it("strategyHasScripts false before insert", async () => {
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_scripts") {
          return {
            select: () => ({
              eq: async () => ({ count: 0, error: null }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { strategyHasScripts } = require("../content-strategy/strategy-has-scripts.ts");
      assert.equal(await strategyHasScripts(STRATEGY_ID), false);
    } finally {
      restore();
    }
  });

  it("strategyHasScripts true after insert", async () => {
    const restore = installReelScriptMocks({
      from: (table: string) => {
        if (table === "neuramark_reel_scripts") {
          return {
            select: () => ({
              eq: async () => ({ count: 1, error: null }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { strategyHasScripts } = require("../content-strategy/strategy-has-scripts.ts");
      assert.equal(await strategyHasScripts(STRATEGY_ID), true);
    } finally {
      restore();
    }
  });
});

describe("reel script agent (US-5.1)", () => {
  it("prompt contains formato guionHints", async () => {
    await withServerOnlyStub(() => {
    const {
      buildReelScriptPrompts,
      UNTRUSTED_FORMATO_HINTS_TAG,
    } = require("../agents/content/generate-reel-script.ts");
    const { systemPrompt, userPrompt } = buildReelScriptPrompts({
      profile: PROFILE_OK,
      locale: "es",
      slotContext: {
        slot: VALID_SLOT,
        modalidad: "faceless",
        mustDiscloseForSlot: false,
        formatoHints: {
          guionHints: "Usa un tip concreto del rubro",
          editingHints: "Cold open",
          duracionIdealSeg: 25,
          ctaTipo: "save",
        },
        tacticaHints: null,
      },
    });
    assert.ok(userPrompt.includes(UNTRUSTED_FORMATO_HINTS_TAG));
    assert.ok(userPrompt.includes("Usa un tip concreto del rubro"));
    assert.ok(systemPrompt.includes("faceless"));
    });
  });

  it("prompt contains tactica hints when slug set", async () => {
    await withServerOnlyStub(() => {
    const {
      buildReelScriptPrompts,
      UNTRUSTED_TACTICA_HINTS_TAG,
    } = require("../agents/content/generate-reel-script.ts");
    const { userPrompt } = buildReelScriptPrompts({
      profile: PROFILE_OK,
      locale: "es",
      slotContext: {
        slot: VALID_SLOT,
        modalidad: "faceless",
        mustDiscloseForSlot: false,
        formatoHints: {
          guionHints: "",
          editingHints: "",
          duracionIdealSeg: null,
          ctaTipo: null,
        },
        tacticaHints: {
          guionHints: "Impacto visual inmediato",
          editingHints: "Rewind 2s",
        },
      },
    });
    assert.ok(userPrompt.includes(UNTRUSTED_TACTICA_HINTS_TAG));
    assert.ok(userPrompt.includes("Impacto visual inmediato"));
    });
  });

  it("buildGenericDisclosurePromptHint present when mustDiscloseForSlot", async () => {
    await withServerOnlyStub(() => {
    const { buildGenericDisclosurePromptHint } = require("../qa/build-generic-disclosure-prompt-hint.ts");
    const { buildReelScriptPrompts } = require("../agents/content/generate-reel-script.ts");
    const hint = buildGenericDisclosurePromptHint(true, "es");
    assert.ok(hint);
    const { systemPrompt } = buildReelScriptPrompts({
      profile: PROFILE_OK,
      locale: "es",
      slotContext: {
        slot: { ...VALID_SLOT, modalidad: "generic_avatar" },
        modalidad: "generic_avatar",
        mustDiscloseForSlot: true,
        formatoHints: {
          guionHints: "",
          editingHints: "",
          duracionIdealSeg: null,
          ctaTipo: null,
        },
        tacticaHints: null,
      },
    });
    assert.ok(systemPrompt.includes(hint!));
    });
  });

  it("five helpers called once per batch job", async () => {
    const counts = {
      profile: 0,
      playbook: 0,
      trend: 0,
      catalog: 0,
      policy: 0,
    };
    const restore = installReelScriptMocks({
      getBusinessProfileForAgents: async () => {
        counts.profile += 1;
        return PROFILE_OK;
      },
      getPlaybookForAgents: async () => {
        counts.playbook += 1;
        return PLAYBOOK_OK;
      },
      getTrendSnapshotForWeek: async () => {
        counts.trend += 1;
        return TREND_OK;
      },
      getProviderCatalog: async () => {
        counts.catalog += 1;
        return {
          providers: [
            {
              key: "siliconflow_qwen",
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
      getCostPolicyForClient: async () => {
        counts.policy += 1;
        return {
          ok: true,
          scope: "global",
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
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return approvedStrategyFrom();
        }
        if (table === "neuramark_agent_rate_limits") {
          return defaultRateLimitFrom();
        }
        if (table === "neuramark_reel_scripts") {
          return {
            upsert: () =>
              chainableQuery({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
                  error: null,
                }),
              }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    });
    try {
      clearReelScriptModuleCache();
      const { generateReelScriptsForClient } = require("./generate-reel-scripts-for-client.ts");
      await generateReelScriptsForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
        invokedBy: "operator",
        mode: "batch",
      });
      assert.equal(counts.profile, 1);
      assert.equal(counts.playbook, 1);
      assert.equal(counts.trend, 1);
      assert.equal(counts.catalog, 1);
      assert.equal(counts.policy, 1);
    } finally {
      restore();
    }
  });
});

describe("reel scripts migration RLS (US-5.1)", () => {
  it("migration enables RLS with zero policies", () => {
    const migrationPath = path.join(
      repoRoot,
      "supabase/migrations/20260830300000_neuramark_reel_scripts.sql",
    );
    assert.equal(existsSync(migrationPath), true);
    const sql = readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
    assert.ok(!sql.match(/CREATE POLICY/i));
  });
});
