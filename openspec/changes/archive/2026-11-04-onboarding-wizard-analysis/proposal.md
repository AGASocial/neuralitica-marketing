# Proposal

## Why

Decide whether owner onboarding should be chat-only, a multi-page wizard, or hybrid — before building another UI surface. Jira **KAN-100**.

## What Changes

- Add `docs/adr/0010-onboarding-chat-vs-wizard.md` comparing chat-only, wizard, and hybrid across completion, clarity, mobile, maintenance, reuse, accessibility, and recoverability.
- Recommend **hybrid** unless repo evidence contradicts: KAN-99 setup checklist is the lightweight “wizard” spine; each step completes via chat or its existing page; no separate multi-page wizard now.
- Cross-link from KAN-84 / ADR-0009 / AGENTS as needed.

## Capabilities

### New Capabilities

None (docs-only; `skip_specs: true`).

### Modified Capabilities

None.

## Impact

- Docs only: ADR-0010 + brief index notes. No runtime behavior change.
