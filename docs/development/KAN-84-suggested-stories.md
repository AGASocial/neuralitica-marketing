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
| KAN-84.10 | Chat thread persistence | `neuramark_*` threads; resume. |
| KAN-84.11 | MCP-UI optional | Same safety; not required for V1. |
| KAN-84.12 | Model quality eval | flash-lite vs stronger when orchestration quality needs it. |

## Out of scope for chat

- Instagram publish from chat.
- Autonomous `$desarrollar` loops (quarantine).
