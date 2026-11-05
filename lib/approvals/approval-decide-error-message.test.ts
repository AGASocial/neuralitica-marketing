import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APPROVAL_DECIDE_FALLBACK_ES,
  approvalDecideErrorMessage,
  shouldForceApproveError,
} from "@/lib/approvals/approval-decide-error-message";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const esErrors = {
  unauthenticated: "Inicia sesión para continuar.",
  forbidden: "No tienes acceso a eso.",
  validation: "Revisa tu entrada e inténtalo de nuevo.",
  notFound: "No se encontró ese paquete de aprobación.",
  forbiddenFields: "Algo salió mal. Inténtalo de nuevo.",
  qaGateNotReady: "Este paquete aún no está listo para aprobación.",
  assemblyNotReady: "El Ensamblado aún no está listo.",
  brandingRequired: "El branding debe completarse antes de la aprobación.",
  captionRequired: "Se requiere un caption antes de la aprobación.",
  captionCtaNotSelected:
    "Debe seleccionarse un llamado a la acción antes de la aprobación.",
  invalidTransition: "Este paquete ya fue decidido.",
  revisionLimitExceeded: "No te quedan rondas de revisión.",
  rateLimited: "Demasiados intentos. Espera e inténtalo de nuevo más tarde.",
  internal: "Algo salió mal. Inténtalo de nuevo más tarde.",
  approveFailed: APPROVAL_DECIDE_FALLBACK_ES,
};

describe("approvalDecideErrorMessage", () => {
  it("maps QA_GATE_NOT_READY to the Spanish catalog string", () => {
    assert.equal(
      approvalDecideErrorMessage(
        {
          code: "QA_GATE_NOT_READY",
          messageKey: "approvals.errors.qaGateNotReady",
        },
        esErrors,
      ),
      esErrors.qaGateNotReady,
    );
  });

  it("maps INVALID_TRANSITION by code when messageKey is absent", () => {
    assert.equal(
      approvalDecideErrorMessage({ code: "INVALID_TRANSITION" }, esErrors),
      esErrors.invalidTransition,
    );
  });

  it("uses the Spanish fallback for an unknown code", () => {
    assert.equal(
      approvalDecideErrorMessage({ code: "NOT_A_REAL_CODE" }, esErrors),
      APPROVAL_DECIDE_FALLBACK_ES,
    );
    assert.notEqual(APPROVAL_DECIDE_FALLBACK_ES, "Error");
  });

  it("uses the Spanish fallback when the action throws", () => {
    assert.equal(
      approvalDecideErrorMessage(null, esErrors),
      APPROVAL_DECIDE_FALLBACK_ES,
    );
  });

  it("still avoids a bare Error when catalog copy is missing", () => {
    assert.equal(
      approvalDecideErrorMessage({ code: "QA_GATE_NOT_READY" }, undefined),
      APPROVAL_DECIDE_FALLBACK_ES,
    );
  });
});

describe("shouldForceApproveError", () => {
  it("is true only for forceApproveError=1", () => {
    assert.equal(shouldForceApproveError("?forceApproveError=1"), true);
    assert.equal(
      shouldForceApproveError("?locale=es&forceApproveError=1"),
      true,
    );
    assert.equal(shouldForceApproveError("?forceApproveError=0"), false);
    assert.equal(shouldForceApproveError(""), false);
  });
});

describe("Hoy approve error wiring", () => {
  it("Hoy and Mis videos map decide errors and never fall back to bare Error", () => {
    const hoy = readFileSync(
      path.join(__dirname, "../../components/dashboard/HoyFeedView.tsx"),
      "utf8",
    );
    const videos = readFileSync(
      path.join(
        __dirname,
        "../../components/ready-to-publish/MyVideosHubView.tsx",
      ),
      "utf8",
    );
    const detail = readFileSync(
      path.join(
        __dirname,
        "../../components/approvals/ApprovalPackageView.tsx",
      ),
      "utf8",
    );
    for (const src of [hoy, videos, detail]) {
      assert.match(src, /approvalDecideErrorMessage/);
      assert.doesNotMatch(src, /loadError \?\? "Error"/);
      assert.doesNotMatch(src, /"Error"/);
    }
    assert.match(hoy, /shouldForceApproveError/);
    assert.match(hoy, /INVALID_TRANSITION/);
    assert.doesNotMatch(videos, /shouldForceApproveError/);
  });
});
