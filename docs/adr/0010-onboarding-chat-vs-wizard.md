# ADR-0010 — Onboarding: chat-only vs wizard vs hybrid

## Status

Accepted (analysis / product decision) — **KAN-100**.

## Context

Owners are non-technical (“plumber principle”, ADR-0009). Onboarding today is
spread across:

- Orchestrator chat (company interview, guided progress, presenter setup tools)
- Dedicated pages: `/interview`, `/profile`, `/settings/preferences`
- Owner Home setup checklist + `getSetupStatus` (**KAN-99**)

The question: should we add a separate multi-page onboarding wizard, stay
chat-only, or combine?

## Options compared

Criteria: completion likelihood, clarity of “what’s next”, mobile fit,
maintenance cost, reuse of existing flows, accessibility, recoverability
(resume after abandon).

| Criterion | Chat-only | Multi-page wizard | Hybrid (recommended) |
|-----------|-----------|-------------------|----------------------|
| **Completion** | High for conversational owners; weak if they leave mid-thread without a checklist | High when linear and short; drop-off if many forced screens | Checklist shows remaining work; each step uses the best surface (chat or page) |
| **Clarity** | Depends on model + tools; can wander | Very clear step index | Checklist is the spine; chat answers “¿Qué me falta?” via `getSetupStatus` |
| **Mobile** | Sheet + FAB already (KAN-84.17) | Extra full-screen flows to build/test | Reuses chat sheet + existing pages; no new wizard chrome |
| **Maintenance** | Prompt/tool drift only | New routes, state machine, i18n, tests | Minimal: KAN-99 already owns % + links |
| **Reuse** | Interview/prefs already dual (chat + page) | Risk of duplicating `/interview` and prefs | Explicitly reuses chat tools + pages |
| **Accessibility** | Chat a11y improving; cards help | Form wizards can be solid if built carefully | Pages keep form semantics; checklist is simple list + links |
| **Recoverability** | Transcript + interview session persistence | Wizard session must be invented | Checklist + existing session/prefs rows; Home shows progress until 100% |

### Chat-only

**Pros:** Matches ADR-0009 extreme abstraction; one place to talk.  
**Cons:** No persistent “map” of setup on Home without KAN-99; Instagram connect
and profile edits are awkward purely in chat.

### Multi-page wizard

**Pros:** Familiar pattern; forced order.  
**Cons:** New UI surface competing with chat and existing pages; duplicates
interview/prefs; higher EN/ES and a11y cost; contradicts “don’t invent parallel
onboarding storage.”

### Hybrid

**Pros:** KAN-99 checklist is a lightweight wizard spine without new routes;
steps complete via chat **or** existing pages; `getSetupStatus` answers
“¿Qué me falta?”; aligns with plumber principle (one next action on Home).  
**Cons:** Instagram step stays incomplete until connect exists (honest empty /
incomplete — same as KAN-98/99).

## Decision

**Hybrid.** Do **not** build a separate multi-page onboarding wizard now.

- The setup checklist (KAN-99) is the wizard spine (progress + “Hacerlo”).
- Each step is done either in orchestrator chat or on its existing page.
- Chat remains the preferred conversational path (ADR-0009); pages remain the
  durable forms for profile / prefs / interview resume.
- Revisit only if measured abandon rates show the checklist+chat combo failing,
  or when Instagram connect ships and needs a dedicated connect UX.

## Consequences

- Product/engineering prioritize Home + chat setup status over a wizard epic.
- Future Instagram connect should plug into the existing checklist step, not a
  parallel wizard.
- ADR-0009 tool catalog and KAN-84 remain the chat IA source of truth.

## References

- ADR-0008 (Campaña UI), ADR-0009 (orchestrator chat)
- KAN-84 suggested stories; KAN-98 owner home; KAN-99 setup completion
- OpenSpec: `setup-completion`, `owner-home-dashboard`, `orchestrator-chat`, `onboarding`
