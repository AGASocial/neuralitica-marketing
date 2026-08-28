# Sprint State — Master Orchestrator

> Mantenido por `master-orchestrator`. No editar manualmente salvo para corregir un atasco.

```yaml
current_phase: 1
current_story: US-14.4
feature_branch: feature/US-14.4-reset-password
story_status: BUILD
last_completed_story: US-14.2
phase_status: in_progress
blocked_reason: null
updated_at: 2026-08-28T21:10:00Z
```

## Fase 1 — Base del Cliente

| Story | Status | Notes |
|-------|--------|-------|
| US-14.1 Sign up | done | VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS; pending-after-confirm E2E still open |
| US-14.2 Login | done | VALIDATE PASS WITH NOTES; QA APPROVE; 1 AC deferred to US-14.5 |
| US-14.4 Reset password | in_progress | CONTRACT + FE signoff; BUILD in progress |
| US-14.5 Session + guards | pending | Depends on US-14.2 |
| US-14.3 Logout | pending | Depends on US-14.5 |
| US-2.x Interview + Ficha | pending | |
| US-3.x Preferencias visuales | pending | |

## Historial reciente

- 2026-08-28 · US-14.2 CLOSE: 15/16 AC; every-request guard deferred to US-14.5
- 2026-08-28 · US-14.4 SELECT → PREP → SPEC ALIGNED → SECURITY APPROVE WITH CONDITIONS
- 2026-08-28 · US-14.4 CONTRACT + FE signoff: `/auth/callback/recovery` → `/reset-password/new`
- 2026-08-28 · US-14.4 BUILD: FE + BE in parallel
