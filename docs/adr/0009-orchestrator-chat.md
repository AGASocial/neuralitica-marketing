# ADR-0009 — Orchestrator chat (generative UI + extreme abstraction)

## Contexto

KAN-84: Clients and Operators currently navigate a wide top-level IA (dashboard,
profile, preferences, approvals, ready-to-publish, plus six Operator links) and
drive the weekly content pipeline through forms.

**Product principle (owner):** a plumber with zero tech/social-media knowledge
must run their whole campaign. The social engine plans from company onboarding
(Entrevista / Ficha viva). The owner converses in plain language, attaches a
photo when asked, and taps **Approve** / **Change something** on simple cards.
No jargon in owner-facing UI or chat (avoid: b-roll, faceless, provider, tokens,
avatar segments, QA, cost policy, etc.).

## Decisión

### Stack

Adopt **AI SDK v7 tool-call parts** (`ai` + `@ai-sdk/react` `useChat`) rendered
as first-party Campaña shadcn cards with zod-typed tool I/O (`lib/contracts/orchestrator-chat.ts`).
MCP-UI (`@mcp-ui/*`) is optional later — same proposal/confirm semantics.

- **Transport:** `POST /api/chat` → `streamText` via AI Gateway; default model
  `google/gemini-2.5-flash` (`ORCHESTRATOR_CHAT_MODEL` override).
- **Model choice (prod smoke 2026-11 + KAN-97):** `google/gemini-2.5-flash-lite`
  leaked English chain-of-thought and tool names into owner-visible replies.
  Default is therefore **`google/gemini-2.5-flash`**. Harness:
  `docs/development/KAN-97-orchestrator-model-eval.md` +
  `scripts/orchestrator-model-eval.mjs`. Always stream with `sendReasoning: false`;
  sanitize visible text; never name tools in owner-visible output.
- **Domain:** tools call existing services; **action tools never mutate** — they
  return proposals; mutation only on user Approve via existing Server Actions.
- **Safety:** never auto-spend; never publish to Instagram from chat;
  `getCurrentUser()` / role on every tool and mutation.
- **Attachments:** validated server-side via existing avatar-reference upload path.

### Extreme abstraction (owner UX)

- Chat EN/ES: short, proactive (“I drafted this month’s plan — approve it?”),
  minimal questions, one primary CTA per card (**Approve** / **Change something**).
- Technical details stay on Operator / **Advanced** screens, not in owner chat copy.
- Cards show human summaries only; internal tool payloads may keep domain ids.

### Information architecture

| Audience | Top-level |
|----------|-----------|
| **Owner (Cliente)** | **Home** (chat-first), **My campaign** (`/approvals`), **My videos** (`/ready-to-publish`), **My business** ▾ (`/profile`, `/settings/preferences`) — copy via `messages/` + `resolveRequestLocale` (honors `?locale=` and `preferredLocale`) |
| **Operator** | Same owner items + **Advanced** ▾ (strategy, scripts, calendar, playbook, trends, cost policy, cycle) |

Old flat nav (5 client + 6 operator links) is replaced by this grouping. **All
existing routes stay reachable**; nothing is deleted. Chat is a persistent
right-side sheet (header **Chat** toggle always labeled + keyboard shortcut;
mobile FAB bottom-right, safe-area aware, hidden while the sheet is open), and
Home emphasizes chat.

**Home dashboard (KAN-98):** `/dashboard` is an owner status home — single next
action (open chat or deep link), this-week counts (scheduled / published /
waiting for OK / in production), campaign progress “X of Y videos”, Results
empty state until Instagram insights exist in-product (no Graph publish or new
insights API from Home), recent videos strip, and compact **Atajos**. Server
loaders use zod DTOs; Home never mutates, spends, or publishes.

**Onboarding shape (KAN-100 / ADR-0010):** hybrid — setup checklist (KAN-99) is
the lightweight wizard spine; steps complete via chat or existing pages; no
separate multi-page wizard now.

**Transcript scroll:** the message list uses stick-to-bottom (`useStickToBottom`):
always scroll on send; keep sticking while streaming/new parts if within ~80px of
the bottom; pause when the user scrolls up; resume when they return. A small
“↓ New messages” / “↓ Nuevos mensajes” control appears when not stuck. Scroll
container is the transcript pane only (full-height sheet, safe-area insets).

### Tool catalog (phase 1+)

| Tool | Kind | Role | Mutates? | Owner-facing card |
|------|------|------|----------|-------------------|
| `getSetupStatus` | read | client + operator | no | Setup % + missing steps (“¿Qué me falta?”) — KAN-99 |
| `listCampaignStatus` | read | client + operator | no | “Where things stand” |
| `getWeeklyStrategy` | read | client + operator (own) | no | “This week’s plan” (plain) |
| `getScriptsStatus` | read | operator | no | Advanced status (plain labels) |
| `proposeGenerateStrategy` | proposal | operator | **no** → `generateContentStrategy` | “Create this week’s plan?” |
| `proposeApproveStrategy` | proposal | operator | **no** → `approveContentStrategy` | “Approve this plan?” |
| `proposeApprovePendingVideo` | proposal | client + operator | **no** → `decideApproval` | “Approve this video?” |
| `proposeGenerateScripts` | proposal | operator | **no** → `generateReelScripts` | “Write this week’s videos?” |
| `proposeGenerateVideos` | proposal | operator | **no** → prepare scripts; paid media needs cost card (KAN-93) | “Create the videos?” |
| `getVideoPreview` | read | client + operator | no | Playable video + caption |
| `getScriptPreview` | read | operator | no | Readable write-up |
| `proposeRequestVideoChanges` | proposal | client + operator | **no** → `decideApproval` request_changes | “Apply these changes?” |
| `proposeRegenerateScript` | proposal | operator | **no** → `regenerateReelScriptSlot` | “Rewrite this write-up?” |
| `proposeConfirmPaidGeneration` | proposal | operator | **no** until Approve → `confirmPaidGenerationFromChat` (re-checks estimate, then b-roll/HeyGen) | “This costs about $X — approve?” (video) |
| `proposeConfirmTtsGeneration` | proposal | operator | **no** until Approve → `confirmTtsGenerationFromChat` (re-checks ElevenLabs estimate, then TTS) | “Voice costs about $X — approve?” — **separate** from video cost card; defaults to latest eligible write-up + in-card video picker |
| `getInterviewStatus` | read | client + operator | no | Business interview progress + current question |
| `proposeSaveInterviewAnswer` | proposal | client + operator | **no** → `persistInterviewDraft` | “Save this answer?” |
| `proposeSubmitInterview` | proposal | client + operator | **no** → `submitInterview` | “Submit interview?” |
| `proposeEnableOwnAvatar` | proposal | client + operator | **no** → `upsertVisualPreferences` (add `own_avatar`); if consent missing → `grant_presenter_consent` card | “Enable videos with your face?” — **never** starts HeyGen/avatar generation |

Later: MCP-UI host (optional).

**KAN-93:** Paid media never starts from chat without `confirm_paid_generation`
(plain price from existing cost-policy previews). Approve re-validates the live
estimate before calling create jobs.

**TTS voice spend:** `confirm_tts_generation` is a separate card from b-roll/HeyGen;
estimate uses `ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS` (no paid calls in the
proposal tool). Spanish prompts like “¿Cuánto cuesta la voz para mi video?”
**must** call `proposeConfirmTtsGeneration` (card, not bare text). If no video is
named, default to the latest eligible write-up and show an in-card picker
(`eligibleVideos`). Approve → `confirmTtsGenerationFromChat` →
`synthesizeVoiceoverForReelScript`.

**Own-avatar enable:** Spanish prompts like “Quiero usar mi propio avatar”,
“quiero salir yo en los videos”, “activa videos con mi cara” **must** call
`proposeEnableOwnAvatar`. If photo consent is missing, the tool returns the
`grant_presenter_consent` card (`redirectedToConsent`) instead of an error.
Never starts HeyGen/avatar video generation from this path.

**Chat interview:** Same `neuramark_interview_sessions` as `/interview` (no new
tables). Chat asks one step at a time via `getInterviewStatus`, saves through
`proposeSaveInterviewAnswer` → Approve → `persistInterviewDraft`, finishes via
`proposeSubmitInterview` → `submitInterview`. Assistant text renders as Markdown
(bold/italic/code/lists).

**Guided flow (KAN-84):** `getGuidedProgress` + progress card; style in plain
words before paid confirm; `getReadyVideoDownload` for download only — chat
never publishes to Instagram.

**KAN-94:** Presenter setup via chat — `getPresenterSetupStatus`,
`proposeGrantPresenterConsent` → `grantAvatarConsent`,
`proposeSetPresenterVoice` → `upsertAvatar` (gender/language coherence);
photo via existing attach path.

**KAN-95 — thread persistence:** Tables
`neuramark_orchestrator_conversations` (per `client_id`, title, timestamps) and
`neuramark_orchestrator_messages` (`role`, `parts` jsonb, `ui_message_id`,
`created_at`). RLS ENABLE + deny-by-default (service-role Node only; owner scope
via `getCurrentUser().id = client_id`). `POST /api/chat` saves user+assistant
messages on stream `onFinish`; panel loads latest conversation on open;
**New conversation** / **Nueva conversación** starts a fresh thread id. Zod
contracts in `lib/contracts/orchestrator-chat.ts`. Migration file under
`supabase/migrations/`; prod apply is orchestrator-owned (Supabase MCP
`apply_migration` to project `lrnhrzpwgyhkruwxeppw`) — feature PRs do not apply
remote migrations.

### Phases

1. **P1:** Owner IA + Advanced grouping; chat sheet; API; read + proposal tools;
   image attach; contract tests; plain-language system prompt.
2. **P2:** Richer video/script cards; spend-confirm cards.
3. **P3:** Presenter/photo setup via chat; optional MCP-UI.
4. **P4:** Model eval (KAN-97); chat thread persistence (KAN-95).

## Consecuencias

- SPEC / CONTEXT document Orchestrator Chat + extreme abstraction.
- `@ai-sdk/react` runtime dependency.
- Owner nav copy is business language; Operator/Advanced keeps power tools.
- Regression tests: schemas, authz, no mutation without confirm.
