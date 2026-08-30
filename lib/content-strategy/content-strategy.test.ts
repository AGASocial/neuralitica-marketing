/**
 * US-4.1 Content Strategy — contracts, allowlists, mutations, orchestrator.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  contentStrategyBriefSchema,
  contentStrategySlotSchema,
  generateContentStrategyInputSchema,
  validateBriefAgainstAllowlists,
  allowlistViolationsToFields,
} from "../contracts/content-strategy";
import { isPublicPath } from "../auth/public-routes";

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
  tacticaTendenciaSlug: "cold-open-mejor-toma",
};

const VALID_BRIEF = {
  pillars: ["Confianza local", "Educación práctica"],
  themes: ["Invierno: mantenimiento preventivo"],
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
      tema: "Oferta revisión pre-temporada",
      goal: "local_sale" as const,
      formatoPlaybookSlug: "antes-despues",
      modalidad: "own_avatar" as const,
      ctaHint: "DM para agendar",
    },
  ],
};

const PROFILE_OK = {
  exists: true as const,
  clientId: OPERATOR_ID,
  version: 1,
  fields: {
    services: { items: ["Plumbing"] },
    zone: { description: "Austin TX" },
    tone: { description: "Friendly expert" },
    offers: { items: ["Free estimate"] },
    objections: { items: ["Price"] },
    style: { description: "Clean shots" },
    restrictions: { items: ["No politics"] },
  },
  visualModeSummary: {
    allowedModes: ["faceless", "own_avatar"] as const,
    mustDiscloseNotOwner: false,
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
      guionHints: ["Tip"],
      ctaTipo: "save" as const,
    },
    {
      slug: "antes-despues",
      titulo: "Antes y después",
      explicacion: "Transformación",
      estructura: ["Hook"],
      hookType: "before_after_tease" as const,
      duracionIdealSeg: 30,
      modalidadesRecomendadas: ["own_avatar"] as const,
      rubros: [] as const,
      guionHints: ["Antes"],
      ctaTipo: "dm" as const,
    },
  ],
};

const TREND_OK = {
  weekStart: WEEK_START,
  entries: [
    {
      slug: "cold-open-mejor-toma",
      titulo: "Cold open",
      explicacion: "Abrir fuerte",
      hookType: "before_after_tease" as const,
      estructura: ["Cold open"],
      guionHints: ["Impacto"],
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

function clearStrategyModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/content-strategy/") ||
      normalized.includes("/lib/agents/content/") ||
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
  builder.gte = self;
  builder.order = self;
  builder.limit = self;
  builder.insert = self;
  builder.update = self;
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

type MockOptions = {
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  from?: (table: string) => unknown;
  getBusinessProfileForAgents?: (clientId: string) => Promise<unknown>;
  getPlaybookForAgents?: () => Promise<unknown>;
  getTrendSnapshotForWeek?: (weekStart: string) => Promise<unknown>;
  getProviderCatalog?: () => Promise<unknown>;
  getDefaultCostPolicy?: () => Promise<unknown>;
  generateWeeklyContentStrategy?: (params: unknown) => Promise<unknown>;
  createSiliconFlowLlmAdapter?: (
    key: string,
    env: string,
  ) => unknown | null;
  revalidatePath?: (p: string) => void;
  envKey?: string;
};

function installStrategyMocks(options: MockOptions) {
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
          options.getBusinessProfileForAgents ??
          (async () => PROFILE_OK),
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
                key: "siliconflow_deepseek_flash",
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
    if (
      request === "@/lib/agents/content/generate-weekly-strategy" ||
      String(request).includes("generate-weekly-strategy")
    ) {
      return {
        generateWeeklyContentStrategy:
          options.generateWeeklyContentStrategy ??
          (async () => VALID_BRIEF),
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
    clearStrategyModuleCache();
  };
}

describe("content strategy contracts (US-4.1)", () => {
  it("contentStrategyBriefSchema accepts valid 3-slot brief", () => {
    assert.equal(contentStrategyBriefSchema.safeParse(VALID_BRIEF).success, true);
  });

  it("rejects fewer than 3 slots", () => {
    assert.equal(
      contentStrategyBriefSchema.safeParse({
        ...VALID_BRIEF,
        slots: VALID_BRIEF.slots.slice(0, 2),
      }).success,
      false,
    );
  });

  it("rejects more than 7 slots", () => {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      ...VALID_SLOT,
      slotIndex: i,
      tema: `Tema ${i}`,
    }));
    assert.equal(
      contentStrategyBriefSchema.safeParse({ ...VALID_BRIEF, slots }).success,
      false,
    );
  });

  it("rejects unknown top-level keys via .strict()", () => {
    assert.equal(
      contentStrategyBriefSchema.safeParse({
        ...VALID_BRIEF,
        channel: "instagram",
      }).success,
      false,
    );
  });

  it("rejects duplicate slotIndex", () => {
    assert.equal(
      contentStrategyBriefSchema.safeParse({
        ...VALID_BRIEF,
        slots: VALID_BRIEF.slots.map((s) => ({ ...s, slotIndex: 0 })),
      }).success,
      false,
    );
  });

  it("each slot requires tema, formatoPlaybookSlug, modalidad, goal", () => {
    for (const key of [
      "tema",
      "formatoPlaybookSlug",
      "modalidad",
      "goal",
    ] as const) {
      const slot = { ...VALID_SLOT };
      delete (slot as Record<string, unknown>)[key];
      assert.equal(contentStrategySlotSchema.safeParse(slot).success, false);
    }
  });

  it("generate input rejects smuggled clientId", () => {
    assert.equal(
      generateContentStrategyInputSchema.safeParse({
        weekStart: WEEK_START,
        clientId: OPERATOR_ID,
      }).success,
      false,
    );
  });
});

describe("validateBriefAgainstAllowlists", () => {
  const ctx = {
    playbookSlugs: new Set(["tip-rapido", "antes-despues"]),
    trendSlugs: new Set(["cold-open-mejor-toma"]),
    allowedModalidades: new Set(["faceless", "own_avatar"]),
  };

  it("returns [] for valid brief", () => {
    assert.deepEqual(validateBriefAgainstAllowlists(VALID_BRIEF, ctx), []);
  });

  it("flags invalid playbook slug", () => {
    const brief = {
      ...VALID_BRIEF,
      slots: [{ ...VALID_SLOT, formatoPlaybookSlug: "unknown-slug" }],
    };
    const violations = validateBriefAgainstAllowlists(brief, ctx);
    assert.ok(violations.some((v) => v.code === "INVALID_PLAYBOOK_SLUG"));
  });

  it("flags invalid trend slug", () => {
    const brief = {
      ...VALID_BRIEF,
      slots: [{ ...VALID_SLOT, tacticaTendenciaSlug: "unknown-trend" }],
    };
    const violations = validateBriefAgainstAllowlists(brief, ctx);
    assert.ok(violations.some((v) => v.code === "INVALID_TREND_SLUG"));
  });

  it("flags disallowed modalidad", () => {
    const brief = {
      ...VALID_BRIEF,
      slots: [{ ...VALID_SLOT, modalidad: "generic_avatar" as const }],
    };
    const violations = validateBriefAgainstAllowlists(brief, ctx);
    assert.ok(violations.some((v) => v.code === "MODALIDAD_NOT_ALLOWED"));
  });

  it("passes when no tactica slug and empty trend", () => {
    const brief = {
      ...VALID_BRIEF,
      slots: VALID_BRIEF.slots.map((s) => {
        const { tacticaTendenciaSlug: _, ...rest } = s;
        return rest;
      }),
    };
    const violations = validateBriefAgainstAllowlists(brief, {
      ...ctx,
      trendSlugs: new Set(),
    });
    assert.deepEqual(violations, []);
  });

  it("maps violations to fields", () => {
    const fields = allowlistViolationsToFields([
      { path: "slots.0.formatoPlaybookSlug", code: "INVALID_PLAYBOOK_SLUG" },
    ]);
    assert.deepEqual(fields["slots.0.formatoPlaybookSlug"], [
      "INVALID_PLAYBOOK_SLUG",
    ]);
  });
});

describe("generateContentStrategy action", () => {
  it("non-operator returns FORBIDDEN without LLM or INSERT", async () => {
    let agentCalled = false;
    let insertCalled = false;
    const restore = installStrategyMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: () => ({
        insert: () => {
          insertCalled = true;
          return chainableQuery({});
        },
      }),
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
      assert.equal(agentCalled, false);
      assert.equal(insertCalled, false);
    } finally {
      restore();
    }
  });

  it("smuggled clientId returns FORBIDDEN_FIELDS", async () => {
    const restore = installStrategyMocks({});
    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({
        weekStart: WEEK_START,
        clientId: OPERATOR_ID,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("smuggled provider_key returns FORBIDDEN_FIELDS", async () => {
    const restore = installStrategyMocks({});
    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({
        weekStart: WEEK_START,
        provider_key: "heygen_high",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });

  it("happy path INSERTs version 1 draft", async () => {
    let inserted: Record<string, unknown> | null = null;
    const restore = installStrategyMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            insert: (row: Record<string, unknown>) => {
              inserted = row;
              return chainableQuery({
                single: async () => ({
                  data: { id: STRATEGY_ID, version: 1 },
                  error: null,
                }),
              });
            },
          };
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.version, 1);
        assert.equal(result.status, "draft");
        assert.ok(result.slotCount >= 3);
        assert.equal(result.strategyId, STRATEGY_ID);
      }
      assert.equal(inserted?.status, "draft");
      assert.equal(inserted?.version, 1);
    } finally {
      restore();
    }
  });

  it("regenerate INSERTs version 2", async () => {
    let insertedVersion: number | null = null;
    const restore = installStrategyMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          let selectCount = 0;
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => {
                  selectCount += 1;
                  if (selectCount === 1) {
                    return { data: { version: 1 }, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            insert: (row: Record<string, unknown>) => {
              insertedVersion = row.version as number;
              return chainableQuery({
                single: async () => ({
                  data: { id: STRATEGY_ID, version: 2 },
                  error: null,
                }),
              });
            },
          };
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.version, 2);
      assert.equal(insertedVersion, 2);
    } finally {
      restore();
    }
  });

  it("rate limited returns RATE_LIMITED without LLM", async () => {
    let agentCalled = false;
    const restore = installStrategyMocks({
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) =>
                  Promise.resolve({
                    data: [{ attempt_count: 3, window_start: new Date().toISOString() }],
                    error: null,
                  }).then(onFulfilled),
              }),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "RATE_LIMITED");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("in-flight returns GENERATION_IN_FLIGHT", async () => {
    let agentCalled = false;
    let selectCallCount = 0;
    const restore = installStrategyMocks({
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                  onRejected?: (e: unknown) => unknown,
                ) => {
                  const callCount = selectCallCount;
                  selectCallCount += 1;
                  if (callCount === 0) {
                    return Promise.resolve({
                      data: [
                        {
                          in_flight_key: `${OPERATOR_ID}:${WEEK_START}`,
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
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "GENERATION_IN_FLIGHT");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("profile missing returns PROFILE_INCOMPLETE", async () => {
    let agentCalled = false;
    const restore = installStrategyMocks({
      getBusinessProfileForAgents: async () => ({ exists: false }),
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "PROFILE_INCOMPLETE");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });

  it("null visualModeSummary returns PROFILE_INCOMPLETE", async () => {
    let agentCalled = false;
    const restore = installStrategyMocks({
      getBusinessProfileForAgents: async () => ({
        ...PROFILE_OK,
        visualModeSummary: null,
      }),
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategy } = require("./actions/generate-content-strategy.ts");
      const result = await generateContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "PROFILE_INCOMPLETE");
      assert.equal(agentCalled, false);
    } finally {
      restore();
    }
  });
});

describe("getLatestContentStrategy action", () => {
  it("non-operator returns FORBIDDEN", async () => {
    const restore = installStrategyMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    });

    try {
      clearStrategyModuleCache();
      const { getLatestContentStrategy } = require("./actions/get-latest-content-strategy.ts");
      const result = await getLatestContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
    } finally {
      restore();
    }
  });

  it("empty week returns strategy null", async () => {
    const restore = installStrategyMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { getLatestContentStrategy } = require("./actions/get-latest-content-strategy.ts");
      const result = await getLatestContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.strategy, null);
    } finally {
      restore();
    }
  });

  it("returns latest version row", async () => {
    const restore = installStrategyMocks({
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({
                  data: {
                    id: STRATEGY_ID,
                    client_id: OPERATOR_ID,
                    week_start: WEEK_START,
                    version: 2,
                    status: "draft",
                    brief: VALID_BRIEF,
                    created_at: "2026-08-30T18:00:00.000Z",
                    updated_at: "2026-08-30T18:00:00.000Z",
                  },
                  error: null,
                }),
              }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { getLatestContentStrategy } = require("./actions/get-latest-content-strategy.ts");
      const result = await getLatestContentStrategy({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok && result.strategy) {
        assert.equal(result.strategy.version, 2);
        assert.equal(result.strategy.brief.slots.length, 3);
      }
    } finally {
      restore();
    }
  });
});

describe("generateContentStrategyForClient orchestrator", () => {
  it("invokedBy system skips requireOperator and calls agent", async () => {
    let agentCalled = false;
    const restore = installStrategyMocks({
      generateWeeklyContentStrategy: async () => {
        agentCalled = true;
        return VALID_BRIEF;
      },
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            insert: () =>
              chainableQuery({
                single: async () => ({
                  data: { id: STRATEGY_ID, version: 1 },
                  error: null,
                }),
              }),
          };
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategyForClient } = require("./generate-content-strategy-for-client.ts");
      const result = await generateContentStrategyForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        invokedBy: "system",
      });
      assert.equal(result.ok, true);
      assert.equal(agentCalled, true);
    } finally {
      restore();
    }
  });

  it("invalid LLM JSON returns AGENT_OUTPUT_INVALID without INSERT", async () => {
    let insertCalled = false;
    const restore = installStrategyMocks({
      generateWeeklyContentStrategy: async () => ({
        ...VALID_BRIEF,
        slots: VALID_BRIEF.slots.slice(0, 1),
      }),
      from: (table: string) => {
        if (table === "neuramark_content_strategies") {
          return {
            select: () =>
              chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            insert: () => {
              insertCalled = true;
              return chainableQuery({});
            },
          };
        }
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategyForClient } = require("./generate-content-strategy-for-client.ts");
      const result = await generateContentStrategyForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        invokedBy: "system",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "AGENT_OUTPUT_INVALID");
      assert.equal(insertCalled, false);
    } finally {
      restore();
    }
  });

  it("missing env key returns PROVIDER_UNAVAILABLE", async () => {
    const restore = installStrategyMocks({
      createSiliconFlowLlmAdapter: () => null,
      envKey: "",
      from: (table: string) => {
        if (table === "neuramark_agent_rate_limits") {
          return {
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
              }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: () => chainableQuery({}),
            update: () => chainableQuery({}),
            eq: () => chainableQuery({}),
            not: () => chainableQuery({}),
            gte: () => chainableQuery({}),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    try {
      clearStrategyModuleCache();
      const { generateContentStrategyForClient } = require("./generate-content-strategy-for-client.ts");
      const result = await generateContentStrategyForClient({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        invokedBy: "system",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    } finally {
      restore();
    }
  });
});

describe("generateWeeklyContentStrategy agent module", () => {
  it("file includes import server-only", () => {
    const source = readFileSync(
      path.join(repoRoot, "lib/agents/content/generate-weekly-strategy.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /UNTRUSTED_BUSINESS_PROFILE/);
    assert.match(source, /UNTRUSTED_PLAYBOOK_HINTS/);
    assert.match(source, /UNTRUSTED_TREND_HINTS/);
    assert.equal(/\brequireOperator\s*\(/.test(source), false);
  });

  it("uses delimited untrusted blocks in prompts", async () => {
    let capturedSystem = "";
    let capturedUser = "";
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearStrategyModuleCache();
      const { generateWeeklyContentStrategy } = require("../agents/content/generate-weekly-strategy.ts");
      const { resolveProvider } = require("../providers/provider-adapters.ts");
      const catalog = [
        {
          key: "siliconflow_deepseek_flash",
          assetRole: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_1m_tokens", unitCostCents: 14 },
          envKeyName: "SILICONFLOW_API_KEY",
        },
      ];
      const provider = resolveProvider(catalog, {
        assetRole: "llm",
        tier: "low",
        llmVariant: "default",
      });
      assert.equal(provider.key, "siliconflow_deepseek_flash");

      await generateWeeklyContentStrategy({
        profile: PROFILE_OK,
        playbook: PLAYBOOK_OK,
        trend: TREND_OK,
        weekStart: WEEK_START,
        provider,
        locale: "es",
        llmAdapter: {
          providerKey: "siliconflow_deepseek_flash",
          complete: async (input: {
            systemPrompt: string;
            userPrompt: string;
          }) => {
            capturedSystem = input.systemPrompt;
            capturedUser = input.userPrompt;
            return { content: JSON.stringify(VALID_BRIEF) };
          },
        },
      });

      assert.match(capturedUser, /<UNTRUSTED_BUSINESS_PROFILE>/);
      assert.match(capturedUser, /<UNTRUSTED_PLAYBOOK_HINTS>/);
      assert.match(capturedUser, /<UNTRUSTED_TREND_HINTS>/);
      assert.match(capturedSystem, /Instagram Reels only/);
    } finally {
      nodeModule._load = originalLoad;
      clearStrategyModuleCache();
    }
  });
});

describe("migration posture (US-4.1)", () => {
  it("neuramark_content_strategies migration enables RLS with zero policies", () => {
    const migrationPath = path.join(
      repoRoot,
      "supabase/migrations/20260830130000_neuramark_content_strategies.sql",
    );
    assert.equal(existsSync(migrationPath), true);
    const sql = readFileSync(migrationPath, "utf8");
    assert.match(sql, /neuramark_content_strategies/);
    assert.match(sql, /neuramark_agent_rate_limits/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
  });
});

describe("route surface", () => {
  it("/operator/strategy is not a public path", () => {
    assert.equal(isPublicPath("/operator/strategy"), false);
  });
});
