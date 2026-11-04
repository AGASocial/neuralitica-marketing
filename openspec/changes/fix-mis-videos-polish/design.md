# Design: Mis videos polish + hydration

## Context

Soft-insert for brand-completed assemblies (#45) made pending rows visible, but cards still use `captionPreview` (often empty → “—”), disclosure chip “Aviso”, and approval `createdAt` (batch-inserted → identical timestamps). Dashboard last-updated was moved behind `useEffect`, but #418 can still fire if any other client-rendered Intl date/number string differs between Vercel UTC SSR and the browser timezone on first paint.

## Approach

### Pending card enrichment

In `toApprovalListItemDto` (shared by Mis videos + approvals list):

- Resolve assembly → reel script (`hook`, `modalidad`, `strategy_id`, `slot_index`) → optional strategy brief slot (`tema`, `formatoPlaybookSlug`).
- `title`: `tema` → `hook` → trimmed `captionPreview` → empty (UI shows untitled fallback).
- `formatKey`: `modalidad` (`own_avatar` | `generic_avatar` | `faceless`); UI maps via message catalog (plain-language format labels). Prefer modality over raw playbook slug so Spanish owners see meaningful words without an extra playbook join on every list.
- `assembledAt`: assembly `updated_at` when assembly exists; else fall back to approval `createdAt`.
- Keep `hasDisclosure` for detail/package; pending hub card primary badge is format label + “Esperando OK”, not “Aviso”.

### Hydration

- Shared small client helper: format ISO timestamps only after mount; SSR + first client paint use a stable non-locale placeholder (empty / nbsp).
- Use on dashboard last-updated and Mis videos / approvals list date lines that run inside `"use client"` trees on owner routes.
- Keep `suppressHydrationWarning` on the time node as belt-and-suspenders.

### User menu

- aria-label: ES `Menú de usuario`, EN `User menu`.
- Trigger: `shrink-0`, ≥40px touch target, avatar always visible; name remains `sm+` only so iPhone width keeps the control in the sticky header `ml-auto` cluster.

## Risks

- Strategy row missing → title falls back to hook (acceptable).
- Assembly missing → assembledAt falls back to createdAt (rare for soft-insert path).
