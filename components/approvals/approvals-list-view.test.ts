import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("ApprovalsListView card presentation", () => {
  it("uses reel title, AgentCard/MediaThumbnail path, summary, disclosure tooltip, ClientLocalDateTime", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(join(here, "ApprovalsListView.tsx"), "utf8");
    const page = readFileSync(
      join(here, "../../app/(app)/approvals/page.tsx"),
      "utf8",
    );
    const compose = readFileSync(
      join(here, "../../lib/approvals/compose-approval-package.ts"),
      "utf8",
    );
    const detail = readFileSync(join(here, "ApprovalPackageView.tsx"), "utf8");
    const agentCard = readFileSync(
      join(here, "../agent-cards/AgentCard.tsx"),
      "utf8",
    );
    const mapper = readFileSync(
      join(here, "../../lib/agent-cards/map-to-card.ts"),
      "utf8",
    );
    const en = readFileSync(join(here, "../../messages/en.json"), "utf8");
    const es = readFileSync(join(here, "../../messages/es.json"), "utf8");

    assert.match(view, /AgentCard/);
    assert.match(view, /mapApprovalListItemToCard/);
    assert.match(view, /item\.title/);
    assert.match(view, /copy\.cardSummary/);
    assert.match(view, /copy\.disclosureTooltip/);
    assert.match(mapper, /mediaPreviewUrl/);
    assert.match(agentCard, /MediaThumbnail/);
    assert.match(agentCard, /ClientLocalDateTime/);
    assert.doesNotMatch(view, /:\s*"—"/);

    assert.match(page, /cardSummary/);
    assert.match(page, /disclosureTooltip/);
    assert.match(page, /thumbnailAlt/);

    assert.match(compose, /reelTitle/);
    assert.match(detail, /pkg\.reelTitle/);
    assert.match(detail, /disclosureTooltip/);

    assert.match(en, /"disclosureChip": "AI notice"/);
    assert.match(es, /"disclosureChip": "Aviso de IA"/);
    assert.match(es, /"cardSummary": "Revisa este video antes de publicarlo"/);
    assert.match(es, /"disclosureTooltip": "Este video indica que usa IA"/);
  });
});
