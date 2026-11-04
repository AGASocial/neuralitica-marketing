# KAN-84 — Suggested Jira stories (do not auto-create)

Epic: Orchestrator agent chat + generative UI + extreme abstraction (ADR-0009).
**Do not create Jira issues from this file automatically.**

## Suggested stories

| Key (suggested) | Title | Scope |
|-----------------|-------|--------|
| KAN-84.1 | Owner IA + Advanced grouping | Nav: Home / My campaign / My videos / My business; Operator **Advanced** ▾; all routes reachable; EN/ES. |
| KAN-84.2 | Chat shell (plain language) | Right Sheet; shortcut; a11y; Campaña; copy without jargon. |
| KAN-84.3 | Chat API + model env | `POST /api/chat`, gateway, `ORCHESTRATOR_CHAT_MODEL`, auth via `getCurrentUser()`. |
| KAN-84.4 | Read tools + status cards | Campaign / plan / scripts status; owner-facing plain summaries. |
| KAN-84.5 | Proposal cards (no mutate) | Generate/approve plan + approve pending video; Approve → existing Server Actions; tests. |
| KAN-84.6 | Chat photo attachments | Portrait via avatar-reference upload path; server validation. |
| KAN-84.7 | Video approve/change card | Preview + Approve / Change something → `decideApproval`. |
| KAN-84.8 | Spend confirm before paid gen | Plain “this costs about $X” from cost policy; never auto-spend. |
| KAN-84.9 | Presenter photo setup via chat | Consent + photo + voice in plain steps. |
| KAN-84.10 / **KAN-95** | Chat thread persistence | `neuramark_orchestrator_conversations` + `_messages`; resume latest; New conversation / Nueva conversación; persist on `/api/chat` finish. |
| KAN-84.11 | MCP-UI optional | Same safety; not required for V1. |
| KAN-84.12 | Model quality eval | flash-lite vs stronger when orchestration quality needs it. |
| KAN-84.13 | Company interview in chat | Reuse `/interview` + `neuramark_interview_sessions`; one question at a time; `getInterviewStatus` / `proposeSaveInterviewAnswer` / `proposeSubmitInterview`; Markdown assistant text. |
| KAN-84.14 | Activate own_avatar from chat | Confirmation card → `upsertVisualPreferences` (modalities only); never starts HeyGen/avatar generation. ES prompts (“Quiero usar mi propio avatar”, “quiero salir yo en los videos”, “activa videos con mi cara”) must call `proposeEnableOwnAvatar`; missing consent → consent/presenter card. |
| KAN-84.15 | TTS/voice cost confirm card | Separate from b-roll/HeyGen paid card; estimate from ElevenLabs constants; nothing until Approve. ES “¿Cuánto cuesta la voz…?” must render `confirm_tts_generation`; default latest eligible + in-card video picker. |
| KAN-84.16 | Dashboard ES owner copy | Translate remaining dashboard/owner-facing English via `messages/` locale. |
| KAN-84.17 | Mobile chat open affordance | FAB bottom-right (safe-area), hidden when panel open; header Chat label reachable on small screens. |

## Related follow-ons (owner Home)

| Key | Title | Notes |
|-----|-------|-------|
| **KAN-98** | Owner home dashboard | Replace Inicio menu-card grid with next action, week counts, campaign progress, Results (empty until IG insights), recent videos, Atajos. Read-only. |
| **KAN-99** | Setup completion | `computeSetupCompletion` + Inicio checklist (hide at 100%) + chat `getSetupStatus` for “¿Qué me falta?”. Instagram step stays incomplete until connect exists. |
| **KAN-100** | Onboarding chat vs wizard ADR | Docs-only ADR-0010; default hybrid recommendation. |

## Out of scope for chat

- Instagram publish from chat.
- Autonomous `$desarrollar` loops (quarantine).
