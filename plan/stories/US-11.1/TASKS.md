# US-11.1 — Present Reel package for client approval

**Priority:** P0  
**Depends on:** US-10.1 ✅ · US-10.2 ✅ · US-9.2 ✅ (soft: US-6.1/US-6.2 caption + selected CTA)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-11.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (DDL, ensure/list/get/decide, gate re-check, media serve widen, DTOs) + **nextjs-frontend** (`/approvals` list + detail, i18n, mobile preview). Per `docs/development/AGENT-ROSTER.md` Fase 5. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Aprobación** · **Cliente** · **Ensamblado** · **Paquete** · **disclosure** · **Veredicto QA**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-11.2** request-changes / `changes_requested` writes / revision_count / change_requests JSON.
- **US-11.3** ready-to-publish list polish, download/export UX, webhook/email stub (approve → `approved` **is** in Phase A).
- Cliente CTA variant picker (Operator selection via US-6.2 required upstream).
- Reject → auto “generate new piece?” flow.
- Weekly cron enqueue (integrations).
- Instagram publish.
- Cliente override of QA (Operator-only US-10.2).
- Widening `generated_video` / `voiceover` media serve to Cliente.
- **RBAC** beyond `requireActive()` / existing helpers.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_approvals` DDL + RLS deny-by-default | **BE** |
| Ensure package (gate + branding + CTA selected) | **BE** |
| List pending + get package DTO | **BE** + **FE** |
| Decide approve / reject + gate re-check | **BE** |
| Widen `assembled_reel` media serve for Cliente | **BE** |
| `/approvals` + `/approvals/[approvalId]` UI | **FE** |
| Empty / pending / loading / error + mobile preview | **FE** |
| EN/ES `approvals.*` + dashboard card wire | **FE** |
| Request-changes UI | **US-11.2** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration · Zod contracts · ensure/list/get/decide Server Actions · gate re-check · media route widen · IDOR/security tests |
| **nextjs-frontend** | Approvals pages · video/caption/disclosure/overrides render · Approve/Reject · i18n · dashboard CTA |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-11.1-client-approval`** |
| Routes | **`/approvals`** list + **`/approvals/[approvalId]`** detail — **not** `/reels/[id]/approve` |
| Phase A actions | **Approve + Reject only**; hide request-changes |
| Table | **`neuramark_approvals`** — UNIQUE `assembled_reel_id` |
| Status enum | `pending_client` \| `approved` \| `rejected` \| `changes_requested` (last unused until US-11.2) |
| Gate | Re-check `getQaGateStatusForAssembledReel` on **create** and **decide** |
| Package DTO | video · caption (+ selected CTA) · hashtags · disclosure · qaOverrides audit |
| CTA gate | Create fails if `selected_cta_index` NULL |
| Media | Widen **`assembled_reel`** to `requireActive` + same `client_id` |
| List | Pending-only; dedicated empty state |
| Auth | **`requireActive("handler")`** on Cliente surfaces |
| Implementers | nextjs-backend + nextjs-frontend |

### DDL sketch (CONTRACT freezes SQL)

```sql
-- neuramark_approvals
-- id uuid PK
-- client_id uuid NOT NULL → neuramark_clients
-- assembled_reel_id uuid NOT NULL UNIQUE → neuramark_assembled_reels
-- status text NOT NULL CHECK IN ('pending_client','approved','rejected','changes_requested')
--   DEFAULT 'pending_client'
-- client_feedback text NULL  -- optional reject notes; US-11.2 may reuse
-- decided_at timestamptz NULL
-- decided_by uuid NULL → neuramark_clients
-- created_at / updated_at
-- INDEX (client_id, status, created_at DESC)
-- RLS ENABLE; zero policies
```

### Action sketch

```ts
// ensureApprovalPackageForAssembledReel({ assembledReelId })
// 1. requireActive
// 2. load assembly WHERE id + client_id → 404
// 3. require branding completed + output asset
// 4. getQaGateStatusForAssembledReel → !ready → QA_GATE_NOT_READY
// 5. caption selected CTA required → else CAPTION_CTA_NOT_SELECTED
// 6. INSERT pending_client if absent (idempotent)
// 7. return package DTO

// listPendingApprovals()
// 1. requireActive
// 2. optional batch-ensure for gated assemblies
// 3. return pending_client summaries (empty array OK)

// getApprovalPackage({ approvalId })
// 1. requireActive; scope client_id → 404
// 2. return full package DTO (video URL, caption, hashtags, disclosure, qaOverrides)

// decideApproval({ approvalId, decision: 'approved' | 'rejected', clientFeedback? })
// 1. requireActive; load scoped row → 404
// 2. must be pending_client else INVALID_TRANSITION
// 3. re-check gate → !ready → QA_GATE_NOT_READY (no write)
// 4. UPDATE status + decided_at + decided_by (+ feedback on reject)
// 5. return updated summary
```

### Media serve sketch

```ts
// assembled_reel branch:
//   try requireActive; if ok && row.client_id === user.id → serve
//   else try requireOperator; if ok && row.client_id === operator.id → serve
//   else 401/403/404 per house pattern
// Do NOT widen generated_video / voiceover
```

### Package DTO sketch

```ts
{
  approvalId: string;
  assembledReelId: string;
  status: "pending_client" | "approved" | "rejected" | "changes_requested";
  video: { assetId: string; previewUrl: string }; // /api/media/assets/{uuid}
  caption: {
    body: string;
    selectedCtaText: string;
    effectiveCaption?: string; // buildEffectiveInstagramCaption
  };
  hashtags: string[];
  disclosure: { required: boolean; text?: string; messageKey?: string };
  qaOverrides: Array<{
    checkKey: string;
    reason: string;
    createdAt: string;
  }>;
  decidedAt?: string | null;
  createdAt: string;
}
```

---

## FE checklist

- [x] Add App Router pages: `app/(app)/approvals/page.tsx` (list) + `app/(app)/approvals/[approvalId]/page.tsx` (detail).
- [x] List: pending cards; **empty** state; loading; error mapping.
- [x] Detail: `<video>` via authenticated `previewUrl`; caption + selected CTA; hashtags; disclosure when `required`; read-only QA overrides audit (plain text).
- [x] CTAs: **Approve** + **Reject** (optional feedback textarea); **no** request-changes control Phase A.
- [x] Mobile-friendly layout (AC); PrimeReact where appropriate; no hero/marketing clutter.
- [x] Wire dashboard `approvalsCard` CTA → `/approvals`; add header nav Approvals (EN/ES).
- [x] i18n `approvals.*` in `messages/en.json` + `messages/es.json`.
- [x] Pending/disabled states on decide; toast/error for `QA_GATE_NOT_READY`, `CAPTION_CTA_NOT_SELECTED`, IDOR 404.
- [x] Types from `lib/contracts/*` only — no client-supplied gate flags.

## BE checklist

- [x] Migration `neuramark_approvals` per PO DDL (+ RLS zero policies).
- [x] Zod + types in `lib/contracts/approval.ts` (CONTRACT freezes names).
- [x] `ensureApprovalPackageForAssembledReel` — gate + branding + CTA; idempotent INSERT.
- [x] `listPendingApprovals` / `getApprovalPackage` — Cliente-scoped; 404 foreign.
- [x] `decideApproval` — approve/reject only; gate re-check; state machine; actor from session.
- [x] Forbidden-key scan: reject `qaPassed`, `ready`, `status` (as authority), `clientId`, override spoof fields.
- [x] Widen `app/api/media/assets/[assetId]/route.ts` for `assembled_reel` + Cliente tenancy.
- [x] Compose package from assembly + caption + disclosure flag + US-10.2 overrides load.
- [x] Import `getQaGateStatusForAssembledReel` — do not fork readiness rules.
- [x] Import `buildEffectiveInstagramCaption` for effective caption field.
- [x] Security / unit tests: gate fail on decide; IDOR; double-decide; media tenancy; CTA null on ensure.
- [x] `revalidatePath("/approvals")` (and detail) after decide.

## DB checklist

- [x] `neuramark_approvals` as above; all objects `neuramark_` prefixed.
- [x] UNIQUE(`assembled_reel_id`); indexes for Cliente pending list.
- [x] No US-11.2 revision columns in this migration.

---

## Sequence

1. ~~SECURITY design review → `SECURITY.md`~~ ✅
2. ~~BE authors `CONTRACT.md` (freeze Zod, action names, error codes, media matrix)~~ ✅ Frozen — Zod `lib/contracts/approval.ts`
3. FE reviews CONTRACT → “Reviewed by FE”
4. Parallel BUILD: BE (DDL + actions + media) ‖ FE (pages + i18n)
5. VALIDATION → QA → CLOSE (AC checkoff only after validator / user)

## Soft dependencies / handoffs

| Item | Owner |
|------|--------|
| Override audit render | Consumes US-10.2 DTO |
| Request-changes | US-11.2 |
| Download / ready-to-publish list | US-11.3 |
| Auto weekly ensure | integrations later |

## Definition of done (Phase A)

- [ ] PREP artifacts committed; CONTRACT frozen + FE signoff
- [ ] Cliente can open `/approvals`, preview gated package (video+caption+disclosure+overrides), approve or reject
- [ ] Ungated decide rejected; foreign IDs 404; `assembled_reel` playable for owning Cliente
- [ ] VALIDATION.md + QA.md; AC checkoff only on CLOSE
- [ ] No request-changes mutation; no AC checkoff in PREP
