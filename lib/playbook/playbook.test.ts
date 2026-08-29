/**
 * US-16.1 Playbook de formatos — contracts, mutations, agent helper.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  archivePlaybookFormatoInputSchema,
  createPlaybookFormatoInputSchema,
  playbookFormatoAgentDtoSchema,
  playbookPayloadCoreSchema,
  updatePlaybookFormatoInputSchema,
} from "../contracts/playbook";
import { isPublicPath } from "../auth/public-routes";
import {
  mapPlaybookPayloadToAgentDto,
  type PlaybookSelectRow,
} from "./map-playbook-row.ts";

const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";

const VALID_PAYLOAD = {
  titulo: "Tip rápido",
  explicacion: "Un consejo accionable en menos de 30 segundos.",
  estructura: ["Hook", "Tip", "CTA"],
  hook_type: "quick_tip" as const,
  duracion_ideal_seg: 25,
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
  guion_hints: ["Un solo tip; sin relleno."],
  cta_tipo: "save" as const,
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

const clientUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "client@example.com",
  displayName: "Client",
  preferredLocale: "en",
  role: "client",
  active: true,
};

function clearPlaybookModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/playbook/") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function installPlaybookMocks(options: {
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  from?: (table: string) => unknown;
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
          (async () => operatorUser),
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
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    clearPlaybookModuleCache();
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
  builder.is = self;
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

describe("playbook contracts (US-16.1)", () => {
  it("create/update/archive schemas reject extra keys via .strict()", () => {
    assert.equal(
      createPlaybookFormatoInputSchema.safeParse({
        slug: "tip-rapido",
        payload: VALID_PAYLOAD,
        active: true,
      }).success,
      false,
    );
    assert.equal(
      updatePlaybookFormatoInputSchema.safeParse({
        expectedVersion: 1,
        payload: VALID_PAYLOAD,
        slug: "tip-rapido",
      }).success,
      false,
    );
    assert.equal(
      archivePlaybookFormatoInputSchema.safeParse({
        expectedVersion: 1,
        payload: VALID_PAYLOAD,
      }).success,
      false,
    );
  });

  it("update schema excludes slug", () => {
    const parsed = updatePlaybookFormatoInputSchema.safeParse({
      expectedVersion: 1,
      payload: VALID_PAYLOAD,
    });
    assert.equal(parsed.success, true);
  });

  it("agent DTO schema omits ejemplo_referencia", () => {
    const dto = mapPlaybookPayloadToAgentDto("tip-rapido", {
      ...VALID_PAYLOAD,
      ejemplo_referencia: "https://example.internal/ref",
    });
    assert.ok(dto);
    const strict = playbookFormatoAgentDtoSchema.safeParse(dto);
    assert.equal(strict.success, true);
    assert.equal("ejemplo_referencia" in (dto as object), false);
    assert.equal("ejemploReferencia" in (dto as object), false);
  });
});

describe("playbook mutations (isolated)", () => {
  it("non-operator create returns FORBIDDEN without DB insert", async () => {
    let insertCalled = false;
    const restore = installPlaybookMocks({
      requireOperator: async () => {
        const err = Object.assign(new Error("forbidden"), {
          status: 403,
          envelope: { ok: false },
        });
        throw err;
      },
      from: () => ({
        insert: () => {
          insertCalled = true;
          return chainableQuery({});
        },
      }),
    });

    try {
      clearPlaybookModuleCache();
      const { createPlaybookFormato } = require("./create-playbook-formato.ts");
      const result = await createPlaybookFormato({
        slug: "nuevo-formato",
        payload: VALID_PAYLOAD,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN");
      }
      assert.equal(insertCalled, false);
    } finally {
      restore();
    }
  });

  it("create happy path returns version 1", async () => {
    const restore = installPlaybookMocks({
      from: () => ({
        insert: () => chainableQuery({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    });

    try {
      clearPlaybookModuleCache();
      const { createPlaybookFormato } = require("./create-playbook-formato.ts");
      const result = await createPlaybookFormato({
        slug: "checklist-express",
        payload: {
          ...VALID_PAYLOAD,
          titulo: "Checklist express",
          hook_type: "question",
          cta_tipo: "comment",
        },
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.slug, "checklist-express");
        assert.equal(result.version, 1);
      }
    } finally {
      restore();
    }
  });

  it("duplicate slug returns DUPLICATE_SLUG", async () => {
    const restore = installPlaybookMocks({
      from: () => ({
        insert: () => ({ error: { code: "23505" } }),
      }),
    });

    try {
      clearPlaybookModuleCache();
      const { createPlaybookFormato } = require("./create-playbook-formato.ts");
      const result = await createPlaybookFormato({
        slug: "tip-rapido",
        payload: VALID_PAYLOAD,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "DUPLICATE_SLUG");
      }
    } finally {
      restore();
    }
  });

  it("update with stale expectedVersion returns VERSION_CONFLICT", async () => {
    const restore = installPlaybookMocks({
      from: (table: string) => {
        if (table !== "neuramark_content_playbooks") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select: () =>
            chainableQuery({
              maybeSingle: async () => ({
                data: { version: 2, active: true, archived_at: null },
                error: null,
              }),
            }),
        };
      },
    });

    try {
      clearPlaybookModuleCache();
      const { updatePlaybookFormato } = require("./update-playbook-formato.ts");
      const result = await updatePlaybookFormato("tip-rapido", {
        expectedVersion: 1,
        payload: VALID_PAYLOAD,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "VERSION_CONFLICT");
      }
    } finally {
      restore();
    }
  });

  it("update on archived row returns ALREADY_ARCHIVED", async () => {
    const restore = installPlaybookMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({
              data: {
                version: 2,
                active: false,
                archived_at: "2026-08-29T18:00:00.000Z",
              },
              error: null,
            }),
          }),
      }),
    });

    try {
      clearPlaybookModuleCache();
      const { updatePlaybookFormato } = require("./update-playbook-formato.ts");
      const result = await updatePlaybookFormato("tip-rapido", {
        expectedVersion: 2,
        payload: VALID_PAYLOAD,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "ALREADY_ARCHIVED");
      }
    } finally {
      restore();
    }
  });

  it("archive idempotent when already archived", async () => {
    const restore = installPlaybookMocks({
      from: () => ({
        select: () =>
          chainableQuery({
            maybeSingle: async () => ({
              data: {
                version: 2,
                active: false,
                archived_at: "2026-08-29T18:00:00.000Z",
              },
              error: null,
            }),
          }),
      }),
    });

    try {
      clearPlaybookModuleCache();
      const { archivePlaybookFormato } = require("./archive-playbook-formato.ts");
      const result = await archivePlaybookFormato("tip-rapido", {
        expectedVersion: 99,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.alreadyArchived, true);
      }
    } finally {
      restore();
    }
  });
});

describe("getPlaybookForAgents (server-only)", () => {
  it("file includes import server-only and MUST-import comment", () => {
    const source = readFileSync(
      path.join(__dirname, "get-playbook-for-agents.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /MUST import this helper only/i);
    assert.match(source, /Content Strategy/);
    assert.match(source, /Video Script/);
    assert.match(source, /Media Assembly/);
    assert.equal(/\brequireOperator\s*\(/.test(source), false);
  });

  it("excludes archived rows and strips ejemplo_referencia", async () => {
    const activeRow: Pick<PlaybookSelectRow, "slug" | "payload"> = {
      slug: "tip-rapido",
      payload: {
        ...VALID_PAYLOAD,
        ejemplo_referencia: "https://example.internal/ref/tip-rapido",
      },
    };

    const restore = installPlaybookMocks({
      from: () =>
        chainableQuery({
          then: (onFulfilled) =>
            Promise.resolve({
              data: [activeRow],
              error: null,
            }).then(onFulfilled),
        }),
    });

    try {
      clearPlaybookModuleCache();
      const { getPlaybookForAgents } = require("./get-playbook-for-agents.ts");
      const result = await getPlaybookForAgents();
      assert.equal("loadFailed" in result, false);
      if (!("loadFailed" in result)) {
        assert.equal(result.formats.length, 1);
        assert.equal(result.formats[0]?.slug, "tip-rapido");
        assert.equal("ejemplo_referencia" in result.formats[0]!, false);
        assert.equal("ejemploReferencia" in result.formats[0]!, false);
        assert.equal("version" in result.formats[0]!, false);
      }
    } finally {
      restore();
    }
  });

  it("does not introduce a public HTTP playbook Route Handler", () => {
    assert.equal(existsSync(path.join(repoRoot, "app/api/playbook")), false);
    assert.equal(isPublicPath("/operator/playbook"), false);
  });
});

describe("playbookPayloadCoreSchema", () => {
  it("accepts optional editing_hints and ejemplo_referencia for operator payload", () => {
    const parsed = playbookPayloadCoreSchema.safeParse({
      ...VALID_PAYLOAD,
      editing_hints: ["Corte rápido en el hook."],
      ejemplo_referencia: "https://example.internal/ref",
    });
    assert.equal(parsed.success, true);
  });
});
