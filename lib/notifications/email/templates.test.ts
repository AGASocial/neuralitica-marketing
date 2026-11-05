import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function withServerOnlyStub<T>(run: () => T): T {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return run();
  } finally {
    nodeModule._load = originalLoad;
  }
}

const { renderOwnerNotificationEmail } = withServerOnlyStub(() =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/lib/notifications/email/templates"),
);

describe("renderOwnerNotificationEmail", () => {
  it("renders HTML with logo URL from siteUrl", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test Headline",
      body: "Test body text.",
      ctaText: "Click here",
      ctaUrl: "https://example.com/approval/123",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(
      result.html,
      /https:\/\/marketing\.neuraliti\.ca\/email\/neuralitica-logo\.png/,
    );
  });

  it("renders CTA button with correct href", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test Headline",
      body: "Test body text.",
      ctaText: "Review video",
      ctaUrl: "https://marketing.neuraliti.ca/approvals/test-id",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(
      result.html,
      /href="https:\/\/marketing\.neuraliti\.ca\/approvals\/test-id"/,
    );
    assert.match(result.html, /Review video/);
  });

  it("escapes HTML special characters in headline and body", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test <script>alert('xss')</script>",
      body: "Body with <b>tags</b> & ampersands",
      ctaText: "Click & review",
      ctaUrl: "https://example.com/test",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(result.html, /Test &lt;script&gt;/);
    assert.match(result.html, /Body with &lt;b&gt;tags&lt;\/b&gt;/);
    assert.match(result.html, /&amp; ampersands/);
    assert.match(result.html, /Click &amp; review/);
    assert.doesNotMatch(result.html, /<script>/);
  });

  it("renders both html and text versions", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Video esperando tu OK",
      body: "Tengo un video listo para ti.",
      ctaText: "Revisar video",
      ctaUrl: "https://marketing.neuraliti.ca/approvals/abc-123",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.ok(result.html);
    assert.ok(result.text);
    assert.match(result.html, /Video esperando tu OK/);
    assert.match(result.text, /Video esperando tu OK/);
    assert.match(result.html, /Tengo un video listo para ti/);
    assert.match(result.text, /Tengo un video listo para ti/);
    assert.match(
      result.text,
      /Revisar video: https:\/\/marketing\.neuraliti\.ca\/approvals\/abc-123/,
    );
  });

  it("includes footer with site domain", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test",
      body: "Test body",
      ctaText: "Test CTA",
      ctaUrl: "https://example.com",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(result.html, /Neuralitica · marketing\.neuraliti\.ca/);
    assert.match(result.text, /Neuralitica · marketing\.neuraliti\.ca/);
  });

  it("includes secondary link text in Spanish", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test",
      body: "Test body",
      ctaText: "Test CTA",
      ctaUrl: "https://example.com/test",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(result.html, /O <a href="[^"]+">abre este enlace<\/a>/);
  });

  it("applies Campaña brand colors in HTML", () => {
    const result = renderOwnerNotificationEmail({
      headline: "Test",
      body: "Test body",
      ctaText: "Test CTA",
      ctaUrl: "https://example.com",
      siteUrl: "https://marketing.neuraliti.ca",
    });

    assert.match(result.html, /#0E2226/);
    assert.match(result.html, /#F2C94C/);
    assert.match(result.html, /#EAF2EE/);
  });
});
