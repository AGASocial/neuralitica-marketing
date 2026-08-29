/**
 * US-16.2 Snapshot de tendencias — contracts, mutations, agent helper.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  addTrendEntryInputSchema,
  publishOrUpdateSnapshotInputSchema,
  trendEntryAgentDtoSchema,
  trendEntryCreateInputSchema,
  trendEntryUpdateInputSchema,
  trendWeekStartSchema,
} from "../contracts/trend";
import { isPublicPath } from "../auth/public-routes";
import type { TrendEntryCore } from "../contracts/trend";

const WEEK_START = "2026-01-12";
const SEED_WEEK = "2026-01-05";

const VALID_ENTRY = {
  slug: "pregunta-hook-local",
  titulo: "Pregunta hook local",
  week_start: WEEK_START,
  prioridad_semana: 2,
  explicacion: "Abrir con pregunta local relevante al rubro.",
  hook_type: "question" as const,
  estructura: ["Hook", "Desarrollo", "CTA"],
  guion_hints: ["Pregunta concreta del rubro."],
  duracion_ideal_seg: { cold_open: 2, total: 25 },
  modalidades_recomendadas: [] as ("own_avatar" | "generic_avatar" | "faceless")[],
  rubros: [] as (
    | "plumbing"
    | "hvac"
    | "electrical"
    | "cleaning"
    | "landscaping"
    | "auto_repair"
    | "beauty"
    | "fitness"
    | "restaurant"
    | "retail"
    | "professional_services"
    | "healthcare"
    | "real_estate"
    | "home_services"
    | "other"
  )[],
  formatos_playbook_compatibles: ["tip-rapido"],
};

const SEED_ENTRY: TrendEntryCore = {
  slug: "cold-open-mejor-toma",
  titulo: "Cold open con mejor toma",
  week_start: SEED_WEEK,
  activo: true,
  prioridad_semana: 1,
  fuente: "manual",
  explicacion:
    "Abrir con el clip de mayor impacto (2–3 s), luego rewind para contexto, desarrollo y CTA.",
  hook_type: "before_after_tease",
  estructura: ["Cold open (mejor toma)", "Rewind / contexto", "Desarrollo", "CTA"],
  guion_hints: ["Elegir la toma más visual para los primeros 2–3 segundos."],
  editing_hints: ["Cold open: clip de impacto 2–3 s al inicio."],
  duracion_ideal_seg: { cold_open: 2, total: 25 },
  modalidades_recomendadas: ["faceless", "own_avatar"],
  rubros: [],
  formatos_playbook_compatibles: ["antes-despues", "tip-rapido"],
  ejemplo_referencia: "https://example.internal/ref/cold-open-mejor-toma",
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

function clearTrendModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/trend/") ||
      normalized.includes("/lib/playbook/get-playbook-for-agents") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function installTrendMocks(options: {
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  from?: (table: string) => unknown;
  getPlaybookForAgents?: () => Promise<unknown>;
  revalidatePath?: (p: string) => void;
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);

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
          options.requireOperator ??
          (async () => ({
            id: "22222222-2222-4222-8222-222222222222",
            role: "operator",
            active: true,
          })),
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
      request === "@/lib/playbook/get-playbook-for-agents" ||
      String(request).includes("lib/playbook/get-playbook-for-agents")
    ) {
      return {
        getPlaybookForAgents:
          options.getPlaybookForAgents ??
          (async () => ({
            formats: [
              { slug: "tip-rapido" },
              { slug: "antes-despues" },
            ],
          })),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    clearTrendModuleCache();
  };
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
  builder.order = self;
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

describe("trend contracts (US-16.2)", () => {
  it("create/update/publish schemas reject extra keys via .strict()", () => {
    assert.equal(
      trendEntryCreateInputSchema.safeParse({
        ...VALID_ENTRY,
        activo: true,
      }).success,
      false,
    );
    assert.equal(
      trendEntryUpdateInputSchema.safeParse({
        ...VALID_ENTRY,
        slug: "smuggled",
      }).success,
      false,
    );
    assert.equal(
      publishOrUpdateSnapshotInputSchema.safeParse({
        weekStart: WEEK_START,
        client_id: "x",
      }).success,
      false,
    );
  });

  it("update schema excludes slug", () => {
    const { slug: _slug, ...rest } = VALID_ENTRY;
    const parsed = trendEntryUpdateInputSchema.safeParse(rest);
    assert.equal(parsed.success, true);
  });

  it("week_start schema rejects non-Monday dates", () => {
    assert.equal(trendWeekStartSchema.safeParse("2026-01-06").success, false);
    assert.equal(trendWeekStartSchema.safeParse(WEEK_START).success, true);
  });

  it("agent DTO schema omits ejemplo_referencia and activo", () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      clearTrendModuleCache();
      const { mapTrendEntryToAgentDto } = require("./map-trend-row.ts");
      const dto = mapTrendEntryToAgentDto(SEED_ENTRY);
      assert.ok(dto);
      const strict = trendEntryAgentDtoSchema.safeParse(dto);
      assert.equal(strict.success, true);
      assert.equal("ejemplo_referencia" in (dto as object), false);
      assert.equal("ejemploReferencia" in (dto as object), false);
      assert.equal("activo" in (dto as object), false);
    } finally {
      nodeModule._load = originalLoad;
      clearTrendModuleCache();
    }
  });
});

describe("trend mutations (isolated)", () => {
  it("non-operator publish returns FORBIDDEN without DB insert", async () => {
    let insertCalled = false;
    const restore = installTrendMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
      from: () => ({
        insert: () => {
          insertCalled = true;
          return chainableQuery({});
        },
      }),
    });

    try {
      clearTrendModuleCache();
      const { publishOrUpdateSnapshot } = require("./publish-or-update-snapshot.ts");
      const result = await publishOrUpdateSnapshot({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN");
      }
      assert.equal(insertCalled, false);
    } finally {
      restore();
    }
  });

  it("publish new week happy path returns created true", async () => {
    let inserted = false;
    const restore = installTrendMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        insert: (payload: unknown) => {
          inserted = true;
          assert.deepEqual((payload as { week_start: string }).week_start, WEEK_START);
          return chainableQuery({});
        },
      }),
    });

    try {
      clearTrendModuleCache();
      const { publishOrUpdateSnapshot } = require("./publish-or-update-snapshot.ts");
      const result = await publishOrUpdateSnapshot({ weekStart: WEEK_START });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.created, true);
        assert.equal(result.weekStart, WEEK_START);
      }
      assert.equal(inserted, true);
    } finally {
      restore();
    }
  });

  it("publish with duplicate slug in entries returns DUPLICATE_SLUG", async () => {
    const restore = installTrendMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
      }),
    });

    try {
      clearTrendModuleCache();
      const { publishOrUpdateSnapshot } = require("./publish-or-update-snapshot.ts");
      const result = await publishOrUpdateSnapshot({
        weekStart: WEEK_START,
        entries: [VALID_ENTRY, { ...VALID_ENTRY }],
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "DUPLICATE_SLUG");
      }
    } finally {
      restore();
    }
  });

  it("publish rejects non-Monday weekStart", async () => {
    const restore = installTrendMocks({});

    try {
      clearTrendModuleCache();
      const { publishOrUpdateSnapshot } = require("./publish-or-update-snapshot.ts");
      const result = await publishOrUpdateSnapshot({ weekStart: "2026-01-06" });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "VALIDATION_ERROR");
      }
    } finally {
      restore();
    }
  });

  it("update with smuggled slug returns FORBIDDEN_FIELDS", async () => {
    const restore = installTrendMocks({});

    try {
      clearTrendModuleCache();
      const { updateTrendEntry } = require("./update-trend-entry.ts");
      const { slug: _slug, ...rest } = VALID_ENTRY;
      const result = await updateTrendEntry(WEEK_START, VALID_ENTRY.slug, {
        ...rest,
        slug: "new-slug",
      } as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      }
    } finally {
      restore();
    }
  });

  it("add entry rejects unknown Playbook slug", async () => {
    const restore = installTrendMocks({
      getPlaybookForAgents: async () => ({
        formats: [{ slug: "tip-rapido" }],
      }),
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({
              data: {
                week_start: WEEK_START,
                entries: [],
                published_at: "2026-08-29T18:00:00.000Z",
                updated_at: "2026-08-29T18:00:00.000Z",
              },
              error: null,
            }),
          }),
      }),
    });

    try {
      clearTrendModuleCache();
      const { addTrendEntry } = require("./add-trend-entry.ts");
      const result = await addTrendEntry({
        weekStart: WEEK_START,
        entry: {
          ...VALID_ENTRY,
          formatos_playbook_compatibles: ["unknown-formato"],
        },
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "VALIDATION_ERROR");
        assert.deepEqual(result.error.fields?.formatos_playbook_compatibles, [
          "trend.errors.invalidPlaybookSlug",
        ]);
      }
    } finally {
      restore();
    }
  });
});

describe("getTrendSnapshotForWeek (server-only)", () => {
  it("file includes import server-only and MUST-import comment", () => {
    const source = readFileSync(
      path.join(__dirname, "get-trend-snapshot-for-week.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /MUST import this helper only/i);
    assert.match(source, /Content Strategy/);
    assert.match(source, /Video Script/);
    assert.match(source, /Media Assembly/);
    assert.equal(/\brequireOperator\s*\(/.test(source), false);
  });

  it("returns active entries only and strips ejemplo_referencia", async () => {
    const restore = installTrendMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({
              data: {
                week_start: SEED_WEEK,
                entries: [SEED_ENTRY, { ...SEED_ENTRY, slug: "inactive-entry", activo: false }],
              },
              error: null,
            }),
          }),
      }),
    });

    try {
      clearTrendModuleCache();
      const { getTrendSnapshotForWeek } = require("./get-trend-snapshot-for-week.ts");
      const result = await getTrendSnapshotForWeek(SEED_WEEK);
      assert.equal(result.weekStart, SEED_WEEK);
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0]?.slug, "cold-open-mejor-toma");
      assert.equal("ejemplo_referencia" in result.entries[0]!, false);
      assert.equal("ejemploReferencia" in result.entries[0]!, false);
      assert.equal(trendEntryAgentDtoSchema.safeParse(result.entries[0]).success, true);
    } finally {
      restore();
    }
  });

  it("returns safe empty when no row exists", async () => {
    const restore = installTrendMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
      }),
    });

    try {
      clearTrendModuleCache();
      const { getTrendSnapshotForWeek } = require("./get-trend-snapshot-for-week.ts");
      const result = await getTrendSnapshotForWeek("2026-02-02");
      assert.equal(result.weekStart, "2026-02-02");
      assert.deepEqual(result.entries, []);
    } finally {
      restore();
    }
  });

  it("returns safe empty for invalid weekStart", async () => {
    const restore = installTrendMocks({});

    try {
      clearTrendModuleCache();
      const { getTrendSnapshotForWeek } = require("./get-trend-snapshot-for-week.ts");
      const result = await getTrendSnapshotForWeek("2026-01-06");
      assert.equal(result.weekStart, "2026-01-06");
      assert.deepEqual(result.entries, []);
    } finally {
      restore();
    }
  });

  it("does not introduce a public HTTP trend Route Handler", () => {
    assert.equal(existsSync(path.join(repoRoot, "app/api/trends")), false);
    assert.equal(isPublicPath("/operator/trends"), false);
  });
});

describe("validate-playbook-slugs module boundary", () => {
  it("imports getPlaybookForAgents instead of direct Playbook SELECT", () => {
    const source = readFileSync(
      path.join(__dirname, "validate-playbook-slugs.ts"),
      "utf8",
    );
    assert.match(source, /getPlaybookForAgents/);
    assert.equal(/\.from\s*\(\s*["']neuramark_content_playbooks["']\s*\)/.test(source), false);
  });
});

describe("addTrendEntryInputSchema", () => {
  it("accepts optional editing_hints and ejemplo_referencia on create input", () => {
    const parsed = addTrendEntryInputSchema.safeParse({
      weekStart: WEEK_START,
      entry: {
        ...VALID_ENTRY,
        editing_hints: ["Corte rápido en el hook."],
        ejemplo_referencia: "https://example.internal/ref",
      },
    });
    assert.equal(parsed.success, true);
  });
});
