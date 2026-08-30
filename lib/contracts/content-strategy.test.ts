import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowlistViolationsToFields,
  contentStrategyBriefSchema,
  validateBriefAgainstAllowlists,
  type ContentStrategyBrief,
} from "./content-strategy.ts";

const VALID_BRIEF: ContentStrategyBrief = {
  pillars: ["Confianza local", "Educación práctica"],
  themes: ["Mantenimiento preventivo"],
  slots: [
    {
      slotIndex: 0,
      tema: "Por qué revisar antes del frío",
      goal: "trust",
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless",
      tacticaTendenciaSlug: "cold-open-mejor-toma",
    },
    {
      slotIndex: 1,
      tema: "3 señales de filtro sucio",
      goal: "education",
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless",
    },
    {
      slotIndex: 2,
      tema: "Oferta revisión pre-temporada",
      goal: "local_sale",
      formatoPlaybookSlug: "antes-despues",
      modalidad: "own_avatar",
      ctaHint: "DM para agendar",
    },
  ],
};

const ALLOWLIST_CTX = {
  playbookSlugs: new Set(["tip-rapido", "antes-despues"]),
  trendSlugs: new Set(["cold-open-mejor-toma"]),
  allowedModalidades: new Set(["faceless", "own_avatar"]),
};

describe("contentStrategyBriefSchema", () => {
  it("accepts valid 3-slot brief", () => {
    const parsed = contentStrategyBriefSchema.parse(VALID_BRIEF);
    assert.equal(parsed.slots.length, 3);
  });

  it("rejects fewer than 3 slots", () => {
    const result = contentStrategyBriefSchema.safeParse({
      ...VALID_BRIEF,
      slots: VALID_BRIEF.slots.slice(0, 2),
    });
    assert.equal(result.success, false);
  });

  it("rejects more than 7 slots", () => {
    const slots = Array.from({ length: 8 }, (_, slotIndex) => ({
      slotIndex,
      tema: `Tema ${slotIndex}`,
      goal: "trust" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless" as const,
    }));

    const result = contentStrategyBriefSchema.safeParse({
      pillars: ["A"],
      themes: ["B"],
      slots,
    });
    assert.equal(result.success, false);
  });

  it("rejects unknown top-level keys (.strict())", () => {
    const result = contentStrategyBriefSchema.safeParse({
      ...VALID_BRIEF,
      channel: "instagram",
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate slotIndex", () => {
    const result = contentStrategyBriefSchema.safeParse({
      ...VALID_BRIEF,
      slots: VALID_BRIEF.slots.map((slot) => ({ ...slot, slotIndex: 0 })),
    });
    assert.equal(result.success, false);
  });

  it("requires tema, formatoPlaybookSlug, modalidad, goal on each slot", () => {
    const result = contentStrategyBriefSchema.safeParse({
      pillars: ["A"],
      themes: ["B"],
      slots: [{ slotIndex: 0 }],
    });
    assert.equal(result.success, false);
  });
});

describe("validateBriefAgainstAllowlists", () => {
  it("returns [] for valid slugs and modalidad", () => {
    assert.deepEqual(
      validateBriefAgainstAllowlists(VALID_BRIEF, ALLOWLIST_CTX),
      [],
    );
  });

  it("flags invalid formatoPlaybookSlug", () => {
    const brief: ContentStrategyBrief = {
      ...VALID_BRIEF,
      slots: [
        {
          ...VALID_BRIEF.slots[0]!,
          formatoPlaybookSlug: "no-existe",
        },
        VALID_BRIEF.slots[1]!,
        VALID_BRIEF.slots[2]!,
      ],
    };

    const violations = validateBriefAgainstAllowlists(brief, ALLOWLIST_CTX);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.code, "INVALID_PLAYBOOK_SLUG");
  });

  it("flags invalid tacticaTendenciaSlug", () => {
    const brief: ContentStrategyBrief = {
      ...VALID_BRIEF,
      slots: [
        {
          ...VALID_BRIEF.slots[0]!,
          tacticaTendenciaSlug: "trend-inventada",
        },
        VALID_BRIEF.slots[1]!,
        VALID_BRIEF.slots[2]!,
      ],
    };

    const violations = validateBriefAgainstAllowlists(brief, ALLOWLIST_CTX);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.code, "INVALID_TREND_SLUG");
  });

  it("flags modalidad outside allowlist", () => {
    const brief: ContentStrategyBrief = {
      ...VALID_BRIEF,
      slots: [
        {
          ...VALID_BRIEF.slots[0]!,
          modalidad: "generic_avatar",
        },
        VALID_BRIEF.slots[1]!,
        VALID_BRIEF.slots[2]!,
      ],
    };

    const violations = validateBriefAgainstAllowlists(brief, ALLOWLIST_CTX);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.code, "MODALIDAD_NOT_ALLOWED");
  });

  it("passes when trend empty and slots omit tactica slug", () => {
    const brief: ContentStrategyBrief = {
      pillars: VALID_BRIEF.pillars,
      themes: VALID_BRIEF.themes,
      slots: VALID_BRIEF.slots.map((slot) => {
        const { tacticaTendenciaSlug: _removed, ...rest } = slot;
        return rest;
      }),
    };

    const violations = validateBriefAgainstAllowlists(brief, {
      ...ALLOWLIST_CTX,
      trendSlugs: new Set(),
    });
    assert.deepEqual(violations, []);
  });

  it("allowlistViolationsToFields maps paths to codes", () => {
    const fields = allowlistViolationsToFields([
      { path: "slots.0.formatoPlaybookSlug", code: "INVALID_PLAYBOOK_SLUG" },
    ]);
    assert.deepEqual(fields, {
      "slots.0.formatoPlaybookSlug": ["INVALID_PLAYBOOK_SLUG"],
    });
  });
});
