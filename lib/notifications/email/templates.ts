import "server-only";

/**
 * Email template renderer for owner notification emails.
 * Campaña brand: deep teal #0E2226, butter #F2C94C, fog #EAF2EE.
 */

export type OwnerNotificationEmailParams = {
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  siteUrl: string;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

/**
 * Escape HTML special characters for safe interpolation.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render a friendly owner notification email with logo, CTA button, and footer.
 * Returns both HTML and plain-text versions.
 */
export function renderOwnerNotificationEmail(
  params: OwnerNotificationEmailParams,
): RenderedEmail {
  const logoUrl = `${params.siteUrl}/email/neuralitica-logo.png`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.headline)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: #0E2226;
      padding: 32px 24px;
      text-align: center;
    }
    .header img {
      max-width: 240px;
      height: auto;
    }
    .content {
      padding: 40px 24px;
      background-color: #EAF2EE;
    }
    .headline {
      font-size: 24px;
      font-weight: 600;
      color: #0E2226;
      margin: 0 0 16px 0;
      line-height: 1.4;
    }
    .body-text {
      font-size: 16px;
      color: #15323A;
      margin: 0 0 32px 0;
      line-height: 1.6;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #F2C94C;
      color: #0E2226;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .secondary-link {
      font-size: 14px;
      color: #8FAAA8;
      text-align: center;
      margin: 16px 0 0 0;
    }
    .secondary-link a {
      color: #15323A;
      text-decoration: underline;
    }
    .footer {
      padding: 24px;
      text-align: center;
      font-size: 14px;
      color: #8FAAA8;
      background-color: #ffffff;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 32px 20px;
      }
      .headline {
        font-size: 20px;
      }
      .body-text {
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <img src="${escapeHtml(logoUrl)}" alt="Neuralitica Marketing" />
    </div>
    <div class="content">
      <h1 class="headline">${escapeHtml(params.headline)}</h1>
      <p class="body-text">${escapeHtml(params.body)}</p>
      <div style="text-align: center;">
        <a href="${escapeHtml(params.ctaUrl)}" class="cta-button">${escapeHtml(params.ctaText)}</a>
      </div>
      <p class="secondary-link">
        O <a href="${escapeHtml(params.ctaUrl)}">abre este enlace</a> en tu navegador
      </p>
    </div>
    <div class="footer">
      Neuralitica · ${escapeHtml(params.siteUrl.replace(/^https?:\/\//, ""))}
    </div>
  </div>
</body>
</html>`;

  const text = `${params.headline}

${params.body}

${params.ctaText}: ${params.ctaUrl}

---
Neuralitica · ${params.siteUrl.replace(/^https?:\/\//, "")}`;

  return { html, text };
}
