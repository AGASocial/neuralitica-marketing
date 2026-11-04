# Design

## Context

Docs-only ADR. Repo already has chat interview (ADR-0009), dedicated pages (`/interview`, `/profile`, `/settings/preferences`), and KAN-99 setup checklist + `getSetupStatus`. No multi-page wizard exists.

## Goals / Non-Goals

**Goals:** Document comparison + explicit recommendation for product/engineering.

**Non-Goals:** Implement a wizard; change runtime behavior.

## Decisions

1. ADR-0010 lives under `docs/adr/` following existing numbering.
2. Recommendation: **hybrid** — checklist spine (KAN-99); steps via chat or existing pages.
3. `skip_specs: true` because no capability behavior change.

## Risks / Trade-offs

- [Recommendation ages] → Revisit when Instagram connect ships or if completion metrics show chat abandon.
