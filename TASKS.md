# TASKS — neuralitica-marketing

> Checklist trazable a `SPEC.md` y `PLAN.md`. Marcar `[x]` al completar.

Leyenda: `→ SPEC §3 Módulo` · `→ Flujo S4.#`

---

## Fase 1 — Base del Cliente

### Fundación transversal
- [ ] Configurar Supabase migrations con prefijo `neuramark_*` (→ SPEC §5, §6)
- [ ] Implementar `getCurrentUser()` server-side y seam de identidad (→ SPEC §5 · Authentication)
- [ ] Establecer boundary server/client: sin Supabase SDK ni keys en browser (→ SPEC §5, §6)
- [ ] Shell app: dashboard default, i18n EN/ES base (→ SPEC §6 i18n)

### Authentication (→ SPEC §3 Authentication · S3.M1)
- [ ] DB: `neuramark_clients` (`active`, `role`, link auth)
- [ ] Signup / login / logout / reset vía Route Handlers o Server Actions
- [ ] Sesión httpOnly; bloqueo producto si `active=false`
- [ ] Rate limits auth; mensajes anti-enumeración
- [ ] UI cuenta pendiente de activación (EN/ES)

### Interview Builder (→ SPEC §3 · S3.M2 · Flujo S4.1)
- [ ] DB: `neuramark_interview_sessions` (JSON, `draft`|`completed`)
- [ ] UI entrevista por pasos con guardar borrador y progreso
- [ ] Validación schema server-side al submit
- [ ] Submit completo dispara Ficha viva (idempotente)

### Business Profile / Ficha viva (→ SPEC §3 · S3.M3)
- [ ] DB: `neuramark_business_profiles` con versionado
- [ ] Crear/actualizar ficha al completar entrevista
- [ ] `getBusinessProfileForAgents(clientId)` server-only
- [ ] UI resumen + PATCH allowlist campos editables
- [ ] CTA onboarding si no hay ficha

### Preferencias de producción visual (→ SPEC §3 · S3.M4 · Flujo S4.1)
- [ ] DB: `neuramark_visual_preferences` (allowlist modalidades)
- [ ] UI multi-selección: avatar propio · genérico · B-roll
- [ ] DB: `neuramark_avatar_consents` append-only
- [ ] UI consentimiento + revocación; bloqueo avatar propio sin consent
- [ ] Upload referencias retrato + fotos de trabajo → `neuramark_media_assets`
- [ ] `must_disclose_not_owner` server-side para slots genéricos
- [ ] Cambio de preferencias no regenera contenido en vuelo

---

## Fase 2 — Playbook + Tendencias (manual V1)

### Content Playbook (→ SPEC §3 · Playbook P1)
- [ ] DB: `neuramark_content_playbooks` (versionado, JSON schema)
- [ ] Zod/schema: slug, titulo, estructura, hook_type, hints, rubros, modalidades
- [ ] UI Operator: CRUD formatos
- [ ] Seed formatos iniciales (tip rápido, antes/después, objeción, oferta local, mito vs realidad)
- [ ] Contrato server `getPlaybookForAgents()`

### Trend Intelligence manual (→ SPEC §3 · Trend P1)
- [ ] DB: `neuramark_trend_snapshots` (`week_start`, `entries[]`)
- [ ] Zod/schema Táctica de tendencia (explicación + guion_hints + editing_hints)
- [ ] UI Operator: publicar/editar snapshot semanal
- [ ] Seed: `cold-open-mejor-toma`
- [ ] Contrato server `getTrendSnapshotForWeek(weekStart)`

---

## Fase 3 — Estrategia y copy

### Content Strategy Agent (→ SPEC §3 · S3.M5 · Flujo S4.2)
- [ ] DB: `neuramark_content_strategies` (brief JSON por semana)
- [ ] Job: input ficha + playbook + tendencias + allowlist → ≥3 slots
- [ ] Cada slot: tema, `formato_playbook_slug`, modalidad, `tactica_tendencia_slug` opcional
- [ ] Validar modalidad ⊆ allowlist del Cliente
- [ ] UI Cliente: lectura brief; UI Operator: ver/editar/regenerar
- [ ] Rate-limit disparo manual

### Video Script Agent (→ SPEC §3 · S3.M6)
- [ ] DB: `neuramark_reel_scripts` por slot
- [ ] Job: formato + modalidad + táctica → Paquete de guion schema-validado
- [ ] Aplicar `guion_hints` / `editing_hints` (cold open, rewind)
- [ ] Respetar `must_disclose_not_owner`
- [ ] UI warnings longitud on-screen / VO
- [ ] Regenerar slot individual

### Caption Agent (→ SPEC §3 · S3.M7)
- [ ] DB: `neuramark_reel_captions` (caption, hashtags, keywords, CTA variants)
- [ ] Job post-guion; límites IG; plain text
- [ ] ≥2 variantes CTA; selección en Aprobación

---

## Fase 4 — Costo, providers y ensamblado

### Cost Policy Engine (→ SPEC §3 · S3.M8)
- [ ] DB: `neuramark_cost_policies`, `neuramark_provider_catalog`
- [ ] Seed `max_cost_cents` ~150, tier `low`
- [ ] Check presupuesto acumulado pre-Job (reintentos incluidos)
- [ ] UI Operator: política y estimados; sin costos en sesión Cliente

### Video Provider Adapter (→ SPEC §3 · S3.M9 · ADR-0003)
- [ ] Interface `VideoProviderAdapter` en `lib/providers/`
- [ ] DB: `neuramark_video_jobs` (status, lineage, asset_role)
- [ ] Adapter SadTalker (avatar propio/genérico)
- [ ] Adapter Wan B-roll (faceless/B-roll)
- [ ] Re-check consent + budget en createJob
- [ ] Download-and-own a Storage; poll en worker
- [ ] Upload manual Operator (fallback)
- [ ] UI Operator: estado, reintentos, fallos

### Media Assembly Pipeline (→ SPEC §3 · S3.M10 · ADR-0003)
- [ ] Worker Fly.io Docker + FFmpeg (`iad`)
- [ ] Cola jobs ensamblado en Supabase
- [ ] DB: `neuramark_assembled_reels`
- [ ] Ensamblado 9:16: TTS + visual + subtítulos + logo + cover
- [ ] Aplicar `editing_hints` (cold open + rewind)
- [ ] TTS CosyVoice2 low EN/ES
- [ ] UI preview Reel ensamblado

---

## Fase 5 — QA y Aprobación

### QA/Compliance Agent (→ SPEC §3 · S3.M11 · Flujo S4.Q1)
- [ ] DB: `neuramark_qa_reports` (blocking vs overridable)
- [ ] Checks: tono, claims, disclosure IA, avatar/impersonación, CTA
- [ ] Bloqueos legales sin override Operator
- [ ] UI Operator: override overridable con motivo append-only

### Approval Flow (→ SPEC §3 · S3.M12 · Flujo S4.3)
- [ ] State machine: `pending_client` → `approved` | `changes_requested` | `rejected`
- [ ] Gate: solo ensamblado + QA OK
- [ ] UI preview paquete (video + caption + disclosure genérico)
- [ ] Aprobar · pedir cambios (máx 1 ronda/Reel) · rechazar
- [ ] Rechazo: preguntar si generar nueva pieza
- [ ] Ronda agotada → cola Operator

---

## Fase 6 — Publicación en Instagram

### Instagram Publish (→ SPEC §3 · S3.M13 · Flujo S4.4 · ADR-0002)
- [ ] OAuth/token IG Business server-only (patrón karidecor → video)
- [ ] Flujo Graph Reels: container → publish
- [ ] Publicar ahora y programar; re-check `approved`
- [ ] Persistir media_id, permalink, errores
- [ ] UI Cliente: conectar IG, publicar, programar, reintentar
- [ ] Descarga/export respaldo
- [ ] Mensajes error sanitizados Cliente vs detalle Operator (→ Flujo S4.Q1)

---

## Fase 7 — Ciclo semanal automatizado

### Scheduler (→ SPEC §3 · S3.M14 · Flujo S4.2 · ADR-0001)
- [ ] Vercel Cron + Route Handler `CRON_SECRET`
- [ ] Encolar ciclo por Cliente `active` con onboarding completo
- [ ] Orquestar: Estrategia → guion → caption → cost → providers → assembly → QA → Aprobación
- [ ] Idempotencia por Cliente + semana
- [ ] Ciclo parcial: OK → Aprobación; fallidos → Operator
- [ ] Reintentos auto limitados; luego cola Operator
- [ ] UI Operator: disparo manual, pausar/skip semana
- [ ] Verificar SC-1..SC-4 con Cliente interno de prueba

### Onboarding completo (→ Flujo S4.1 cierre)
- [ ] Conectar IG en onboarding (integrar con Fase 6)
- [ ] Checklist onboarding listo antes de entrar al cron

---

## Fase 8 — P2 (post-MVP)

### Content Calendar (→ SPEC §3 P2 · S3.M15)
- [ ] Vista semanal Operator multi-cliente
- [ ] Estados hasta `published`; alertas &lt;3 Reels

### Metrics Lite (→ SPEC §3 P2 · S3.M15)
- [ ] Carga manual views/likes/comments/saves/DMs
- [ ] Inyectar resumen ~4 semanas en siguiente Estrategia

### Trend Intelligence scraping (→ SPEC §3 Trend fase posterior)
- [ ] Agente investigación → mismo schema Táctica de tendencia
- [ ] Flujo revisión Operator antes de activar

---

## Verificación final MVP

- [ ] SC-1: 3 Reels/semana en cola Aprobación sin grabación humana
- [ ] SC-2: publish bloqueado sin Aprobación
- [ ] SC-3: primer lote ≤7 días post-entrevista
- [ ] SC-4: flujo revisión ≤30 min Cliente
- [ ] ADR-0001/0002/0003 respetados en producción
- [ ] i18n EN/ES en flujos Cliente críticos
