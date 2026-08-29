import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  playbookForAgentsLoadFailedSchema,
  playbookForAgentsSuccessSchema,
  playbookFormatoAgentDtoSchema,
  playbookPayloadCoreSchema,
} from "../contracts/playbook";
import { isPublicPath } from "../auth/public-routes";
import { mapPlaybookPayloadToAgentDto } from "./map-playbook-row.ts";

const VALID_PAYLOAD = {
  titulo: "Tip rápido",
  explicacion: "Un consejo accionable en menos de 30 segundos.",
  estructura: ["Hook", "Tip", "CTA"],
  hook_type: "quick_tip",
  duracion_ideal_seg: 25,
  modalidades_recomendadas: [],
  rubros: [],
  guion_hints: ["Un solo tip; sin relleno."],
  cta_tipo: "save",
  ejemplo_referencia: "https://example.internal/ref/tip-rapido",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearPlaybookModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/playbook/get-playbook-for-agents") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return (async () => {
    try {
      clearPlaybookModuleCache();
      return await run();
    } finally {
      nodeModule._load = originalLoad;
      clearPlaybookModuleCache();
    }
  })();
}

describe("getPlaybookForAgents module (server-only)", () => {
  it("file includes import server-only and MUST-import comment for US-4.x+", () => {
    const source = readFileSync(
      path.join(__dirname, "get-playbook-for-agents.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /MUST/);
    assert.match(source, /import this helper only/i);
    assert.match(source, /Content Strategy \(US-4\.1\)/);
    assert.match(source, /Video Script \(US-5\.1\)/);
    assert.match(source, /US-16\.2/);
    assert.match(source, /ejemplo_referencia stripped/i);
    assert.equal(/\brequireOperator\s*\(/.test(source), false);
    assert.equal(/\brequireActive\s*\(/.test(source), false);
  });

  it("export arity is 0 (global catalog)", async () => {
    await withServerOnlyStub(async () => {
      const { getPlaybookForAgents } = await import(
        "./get-playbook-for-agents.ts"
      );
      assert.equal(getPlaybookForAgents.length, 0);
    });
  });

  it("does not introduce a public HTTP playbook Route Handler", () => {
    assert.equal(existsSync(path.join(repoRoot, "app/api/playbook")), false);
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/content-playbooks")),
      false,
    );
    assert.equal(isPublicPath("/api/playbook"), false);
  });
});

describe("mapPlaybookPayloadToAgentDto outcomes", () => {
  it("maps payload to camelCase agent DTO and strips ejemplo_referencia", () => {
    const payload = playbookPayloadCoreSchema.parse(VALID_PAYLOAD);
    const formato = mapPlaybookPayloadToAgentDto("tip-rapido", payload);
    assert.ok(formato);

    assert.equal(formato.slug, "tip-rapido");
    assert.equal(formato.hookType, "quick_tip");
    assert.equal(formato.duracionIdealSeg, 25);
    assert.equal(formato.ctaTipo, "save");
    assert.deepEqual(formato.guionHints, ["Un solo tip; sin relleno."]);
    assert.equal(
      playbookFormatoAgentDtoSchema.safeParse(formato).success,
      true,
    );

    const serialized = JSON.stringify(formato);
    assert.equal(serialized.includes("ejemplo_referencia"), false);
    assert.equal(serialized.includes("ejemploReferencia"), false);
    assert.equal(serialized.includes("version"), false);
    assert.equal(serialized.includes("archivedAt"), false);
    assert.equal(serialized.includes("active"), false);
  });

  it("includes optional editingHints when present in payload", () => {
    const payload = playbookPayloadCoreSchema.parse({
      ...VALID_PAYLOAD,
      titulo: "Antes y después",
      hook_type: "before_after_tease",
      editing_hints: ["Cold open con el resultado final."],
    });
    const formato = mapPlaybookPayloadToAgentDto("antes-despues", payload);
    assert.equal(formato?.editingHints?.[0], "Cold open con el resultado final.");
  });

  it("returns null when dto would violate strict schema", () => {
    const payload = {
      ...VALID_PAYLOAD,
      guion_hints: ["ok"],
      hook_type: "not-a-hook",
    };
    const parsed = playbookPayloadCoreSchema.safeParse(payload);
    assert.equal(parsed.success, false);
    if (parsed.success) {
      const formato = mapPlaybookPayloadToAgentDto("tip-rapido", parsed.data);
      assert.equal(formato, null);
    }
  });

  it("agent DTO schema .strict() rejects over-disclosure keys", () => {
    const parsed = playbookFormatoAgentDtoSchema.safeParse({
      slug: "tip-rapido",
      titulo: "Tip rápido",
      explicacion: "Un consejo accionable en menos de 30 segundos.",
      estructura: ["Hook", "Tip", "CTA"],
      hookType: "quick_tip",
      duracionIdealSeg: 25,
      modalidadesRecomendadas: [],
      rubros: [],
      guionHints: ["Un solo tip; sin relleno."],
      ctaTipo: "save",
      ejemploReferencia: "https://example.internal/ref/tip-rapido",
    });
    assert.equal(parsed.success, false);
  });
});

describe("getPlaybookForAgents soft outcomes", () => {
  it("returns loadFailed when Supabase is not configured", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(Module);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") {
          return {};
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => false,
            createServerSupabaseClient: () => {
              throw new Error("should not be called");
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearPlaybookModuleCache();
        const { getPlaybookForAgents } = await import(
          `./get-playbook-for-agents.ts?unconfigured=${Date.now()}`
        );
        const result = await getPlaybookForAgents();
        assert.deepEqual(result, { formats: [], loadFailed: true });
        assert.equal(
          playbookForAgentsLoadFailedSchema.safeParse(result).success,
          true,
        );
      } finally {
        nodeModule._load = originalLoad;
        clearPlaybookModuleCache();
      }
    });
  });

  it("queries active non-archived rows only and maps success DTO", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(Module);
      const calls: string[] = [];

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") {
          return {};
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from(table: string) {
                calls.push(`from:${table}`);
                const builder: Record<string, unknown> = {};
                const self = () => builder;
                builder.select = (columns: string) => {
                  calls.push(`select:${columns}`);
                  return builder;
                };
                builder.eq = (column: string, value: unknown) => {
                  calls.push(`eq:${column}=${String(value)}`);
                  return builder;
                };
                builder.is = (column: string, value: unknown) => {
                  calls.push(`is:${column}=${String(value)}`);
                  return builder;
                };
                builder.order = async (
                  column: string,
                  opts: { ascending: boolean },
                ) => {
                  calls.push(`order:${column}:${opts.ascending}`);
                  return {
                    data: [{ slug: "tip-rapido", payload: VALID_PAYLOAD }],
                    error: null,
                  };
                };
                return builder;
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearPlaybookModuleCache();
        const { getPlaybookForAgents } = await import(
          `./get-playbook-for-agents.ts?active-filter=${Date.now()}`
        );
        const result = await getPlaybookForAgents();
        assert.equal("loadFailed" in result, false);
        assert.equal(result.formats.length, 1);
        assert.equal(result.formats[0]?.slug, "tip-rapido");
        assert.equal(
          playbookForAgentsSuccessSchema.safeParse(result).success,
          true,
        );
        assert.equal(calls.includes("from:neuramark_content_playbooks"), true);
        assert.equal(calls.includes("eq:active=true"), true);
        assert.equal(calls.includes("is:archived_at=null"), true);
      } finally {
        nodeModule._load = originalLoad;
        clearPlaybookModuleCache();
      }
    });
  });

  it("soft-fails when all rows are corrupt", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(Module);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") {
          return {};
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from() {
                const builder: Record<string, unknown> = {};
                const self = () => builder;
                builder.select = self;
                builder.eq = self;
                builder.is = self;
                builder.order = async () => ({
                  data: [{ slug: "tip-rapido", payload: { titulo: "bad" } }],
                  error: null,
                });
                return builder;
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearPlaybookModuleCache();
        const { getPlaybookForAgents } = await import(
          `./get-playbook-for-agents.ts?corrupt=${Date.now()}`
        );
        const result = await getPlaybookForAgents();
        assert.deepEqual(result, { formats: [], loadFailed: true });
      } finally {
        nodeModule._load = originalLoad;
        clearPlaybookModuleCache();
      }
    });
  });
});
