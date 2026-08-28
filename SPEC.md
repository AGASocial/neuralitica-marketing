# SPEC — neuralitica-marketing

> Especificación neutral de metodología (capa de fundación SDD).
> Destino de emisión: generic-sdd.
> Fuente de verdad compartida entre el equipo y los agentes de IA.

---

## 1. Visión del Producto
*Qué es, para quién, qué problema resuelve y cómo sabremos que funciona. En lenguaje no técnico.*

- **Visión (≤ 2 párrafos):** Neuralitica Marketing existe para que prestadores de servicios locales (plomería, belleza, oficios técnicos y similares) mantengan presencia útil en Instagram sin inventar ideas, escribir textos ni grabarse. El Cliente responde una Entrevista inicial, configura sus **Preferencias de producción visual** (avatar propio, genérico y/o B-roll) y aprueba el contenido; el sistema produce Reels, captions y piezas relacionadas listas para revisión.

  La esencia de la V1 es un agente Instagram **video-first**, operable y vendible: unos **3 Reels semanales** con QA y Aprobación antes de cualquier publicación, sin multicanal ni publicación automática obligatoria. Quita la carga de redes al prestador; no es una plataforma omnicanal ni una herramienta técnica compleja.

- **Usuario principal:** Cliente (prestador de servicios locales).
- **Problema que resuelve:** No saben qué publicar, no tienen tiempo, no quieren grabarse, no escriben buenos captions, no tienen estrategia, publican irregularmente y no convierten redes en conversaciones comerciales.

### Criterios de éxito (medibles, agnósticos de tecnología)
- **SC-1:** Un Cliente activo recibe 3 Reels listos para aprobar cada semana, sin grabarse.
- **SC-2:** Ninguna pieza se marca como publicada sin Aprobación explícita del Cliente.
- **SC-3:** Tras la Entrevista inicial, el Cliente puede revisar y decidir (aprobar / pedir cambios / rechazar) sobre su primer lote de contenido en ≤ 7 días.
- **SC-4:** En el ciclo semanal, el Cliente dedica ≤ 30 minutos a revisar y aprobar (sin producir guiones ni videos).

### Fuera de alcance (v1)
- TikTok, YouTube, LinkedIn, Blog
- **Stories de Instagram** (volumen HL diferido; V1 = Reels-only)
- Ads
- CRM avanzado
- Dashboard complejo
- Publicar en Instagram **sin** Aprobación previa del Cliente
- Automatización completa de DMs
- Edición avanzada propietaria de video
- Multicanal

### Supuestos
- El material de `plan/` (USER_STORIES + SECURITY + roadmap v1.1) es la fuente operativa; HIGH_LEVEL_PLAN.md §8 (lista de 11 módulos) está parcialmente supersedido.
- Volumen objetivo V1: 3 Reels IA / semana / Cliente.
- La integración Instagram Business (Graph) para **Reels** se inspira en el patrón ya probado en karidecor (`lib/instagram`: token server-side, container → publish), adaptado a video.
- **Prefijo DB canónico:** todo objeto Supabase (tablas, triggers, indexes, functions, enums, policies) usa el prefijo `neuramark_` (ej. `neuramark_interview_sessions`). Confirmado S3.Qa3.

### Disparo del ciclo semanal (V1) — confirmado en entrevista
- Por defecto, un **scheduler/cron** del System ejecuta por cada Cliente activo: Estrategia semanal + generación de video (hasta cola de Aprobación).
- El Operator no es necesario para el ciclo normal; solo supervisión, excepciones y disparo manual opcional.

### Regla de Aprobación (V1) — confirmada en entrevista
- **Pedir cambios:** máximo 1 ronda de revisión por Reel; se reprocesa solo lo afectado.
- **Rechazar:** no regenera en silencio; el sistema **pregunta** si el Cliente desea generar una pieza nueva. Si acepta, se dispara un nuevo Job de generación (sustituye/ocupa el slot de esa pieza rechazada según cupo semanal).
- **Aprobar:** la pieza queda lista para **Publicación en Instagram** (API Business).

### Publicación en Instagram (V1) — confirmada en entrevista (S2.Qa2)
- Tras Aprobación, el System puede publicar **Reels** vía Instagram Business / Graph API (credenciales server-side).
- **Ambos modos:** (1) botón “Publicar ahora” (Cliente u Operator); (2) programación / auto opcional en horario elegido.
- Nunca publica sin Aprobación (SC-2 intacto).
- Descarga/export sigue disponible como respaldo.

---

## 2. Usuarios y Casos de Uso
*Roles concretos con acciones concretas. Sin perfiles de marketing.*

- **Cliente:** completar Entrevista inicial; mantener Ficha viva / datos; configurar **Preferencias de producción visual** (qué modalidades acepta: avatar propio, genérico, B-roll) y Consentimiento de avatar; subir referencias/fotos de trabajo; conectar/gestionar cuenta Instagram Business; aprobar / pedir cambios / rechazar piezas; decidir si generar nueva tras rechazo; publicar Reel ahora o programar; descarga de respaldo.
- **Operator:** supervisar fallos; overrides QA; publicar/reintentar; intervenir tras revisión agotada; disparo manual del ciclo; **curar Playbook de formatos** y **Snapshot de tendencias** semanal (manual V1).
- **System:** Ciclo semanal automatizado (estrategia + video hasta Aprobación) + publicación de Reels vía Graph API (inmediata o programada) tras Aprobación.
- **Acciones solo Operator:** overrides QA (salvo gates legales), catálogo/tiers de costo, calendario agregado multi-cliente, reintentos/intervención de jobs fallidos (gen/publish), disparo manual del ciclo.
- **Usuario anónimo:** signup / login / reset; sin acceso a producto hasta `active=true` (activación SQL).

---

## 3. Funcionalidades por Módulo
*Comportamiento observable. "El usuario puede…" / "El sistema hace/calcula/envía automáticamente…".
Cada módulo lleva su prioridad: **P1** (MVP: sin esto no hay producto) · **P2** (importante) · **P3** (deseable).*

Canon de módulos y prioridades: confirmado (S3.LOTE). Detalle módulo a módulo en curso.

### Módulo: Authentication — Prioridad: P1
- El usuario puede: registrarse (email/password/nombre), confirmar email, iniciar sesión, cerrar sesión, recuperar password; ver “cuenta pendiente de activación” si `active=false`.
- El System automáticamente: Auth solo vía backend Next (sin SDK/tokens Supabase en browser); sesión httpOnly; identidad solo `getCurrentUser()`; crea `…_clients` con `active=false` y `role=client`; bloquea producto y gasto si inactivo; rate limits y mensajes genéricos anti-enumeración.
- Solo Operator (SQL, sin UI V1): activar cuenta; promover a `operator`.
- Fuera V1: UI de activación, invite-only, RBAC.
- Confirmado: S3.M1 (2026-08-27).

### Módulo: Interview Builder — Prioridad: P1
- El Cliente puede: iniciar Entrevista inicial por pasos (servicios, zona, tono, ofertas, objeciones, estilo, restricciones); guardar borrador y retomar; enviar cuando esté completa; ver progreso/errores (EN/ES).
- El System automáticamente: persiste JSON estructurado en `neuramark_interview_sessions`; valida schema server-side; `client_id` solo vía `getCurrentUser()`; estados `draft`|`completed` (completed read-only salvo Operator); al submit completo dispara creación/actualización de Ficha viva (idempotente).
- Fuera V1: Cliente reabre entrevista a voluntad; entrevista libre sin pasos.
- Confirmado: S3.M2 (2026-08-27).

### Módulo: Business Profile (Ficha viva) — Prioridad: P1
- El Cliente puede: ver resumen vivo del negocio; editar campos permitidos sin rehacer la Entrevista; ver CTA de onboarding si no hay ficha.
- El System automáticamente: crea/actualiza `neuramark_business_profiles` al completar entrevista; contrato solo-server para agentes (`getBusinessProfileForAgents`); versiona ediciones; PATCH con allowlist (sin consent/modo visual/campos sistema).
- Fuera V1: historial completo de versiones (nice-to-have).
- Confirmado: S3.M3 (2026-08-27).

### Módulo: Avatar / Visual Mode Selector — Prioridad: P1
- El Cliente puede: indicar **Preferencias de producción visual** (multi-selección, no un solo modo rígido): avatar propio autorizado · avatar genérico profesional · **B-roll / sin presencia**; dar/revocar Consentimiento de avatar; subir referencias de retrato (avatar propio) y **fotos de trabajos** (B-roll); ver disclosure de genérico.
- El System automáticamente: persiste allowlist en `neuramark_visual_preferences`; consent append-only; re-check en Job; revocación cancela cola own-avatar; rechaza avatar propio sin consent/assets; `must_disclose_not_owner` cuando el slot use genérico; nunca exige grabación humana; cambiar preferencias no regenera en silencio.
- **Regla clave (confirmado cierre):** las preferencias definen el **menú permitido**; la **modalidad por Reel** la asigna la Estrategia semanal **por slot** (formato + tema + playbook + tendencias), siempre dentro del allowlist del Cliente.
- Confirmado: S3.M4 (2026-08-27). **Ampliado cierre (2026-08-28):** preferencias flexibles + asignación semanal por slot.

### Módulo: Content Playbook — Prioridad: P1
- Operator: curar catálogo **evergreen** de **Formatos de Reel** en `neuramark_content_playbooks` (versionado).
- Cada formato incluye (schema-validado): `slug`, `titulo`, `explicacion`, `estructura` (beats ordenados), `hook_type`, `duracion_ideal_seg`, `modalidades_recomendadas`, `rubros` (vacío = todos), `guion_hints`, `editing_hints` (opcional), `cta_tipo`, `ejemplo_referencia` (opcional, solo Operator).
- Puede referenciar **técnicas de edición** reutilizables (ej. cold open) que Trend Intelligence puede priorizar semanalmente.
- Content Strategy elige **formato por slot**; Video Script y Media Assembly consumen hints del formato.
- Confirmado: cierre (2026-08-28). **Schema confirmado (2026-08-28).**

### Módulo: Trend Intelligence — Prioridad: P1
- **V1 manual:** Operator publica un **Snapshot de tendencias** semanal en `neuramark_trend_snapshots` (`week_start`, `entries[]` JSON schema-validado).
- Cada **Táctica de tendencia** (entrada del snapshot) incluye:
  - Identificación: `slug`, `titulo`, `week_start`, `activo`, `prioridad_semana` (1–5), `fuente` (`manual` | `scraping` | `operator_review`).
  - Humano: `explicacion` (por qué funciona, cuándo usarla), `evitar` (anti-patrones, opcional), `ejemplo_referencia` (URL/nota, opcional, Operator-only).
  - Agente (estructurado): `hook_type`, `estructura[]` (beats), `guion_hints[]`, `editing_hints[]`, `duracion_ideal_seg` (ej. `{ cold_open: 2, total: 25 }`).
  - Aplicabilidad: `modalidades_recomendadas`, `rubros[]`, `formatos_playbook_compatibles[]` (slugs del playbook).
- **Ejemplo canónico V1:** `cold-open-mejor-toma` — clip de impacto 2–3s al inicio → rewind/contexto → desarrollo → CTA; ideal B-roll o avatar con fotos de trabajo.
- Content Strategy puede adjuntar `tactica_tendencia_slug` por slot; Video Script y Media Assembly aplican `guion_hints` + `editing_hints`.
- **Fase posterior:** agente scraping/investigación rellena el **mismo schema**; Operator revisa antes de activar (o reglas de auto-activación configurables).
- No promete viralidad; son heurísticas que QA y ficha pueden vetar.
- Confirmado: cierre (2026-08-28). **Schema confirmado (2026-08-28).**

### Módulo: Content Strategy Agent — Prioridad: P1
- Salida: Estrategia semanal IG (≥3 slots Reels) en `neuramark_content_strategies`; cada slot incluye **tema + formato_playbook_slug + modalidad de producción + tactica_tendencia_slug** (opcional) elegidos dentro de preferencias del Cliente.
- Input: Ficha viva + Playbook + Snapshot de tendencias (si existe) + preferencias visuales allowlist.
- Disparo: Ciclo semanal automatizado por defecto; Operator puede ver/editar/regenerar/disparar manual (rate-limit).
- **Auto-avance:** tras estrategia válida, el ciclo continúa a guiones/generación sin approve Operator obligatorio.
- Cliente: lectura del brief en V1 (ve formato y modalidad por Reel; no edita estrategia).
- System: schema-validate brief; modalidad por slot ⊆ allowlist; LLM vía catálogo/tier; keys solo server.
- Confirmado: S3.M5 (2026-08-27). **Ampliado cierre (2026-08-28):** playbook + tendencias + modalidad dinámica por slot.

### Módulo: Video Script Agent — Prioridad: P1
- El System automáticamente: por cada slot de Estrategia genera Paquete de guion adaptado al **Formato de Reel**, **modalidad de producción** y **Táctica de tendencia** si aplica (`guion_hints` del playbook/tendencia); incluye hook, cuerpo, CTA, texto en pantalla, VO, beats visuales B-roll, notas cold open/rewind cuando `editing_hints` lo indiquen (~15–45s) en `neuramark_reel_scripts`; respeta Ficha viva y `must_disclose_not_owner`; auto en ciclo tras estrategia; schema-validate; LLM vía catálogo/tier.
- Operator/Cliente: ver guiones; Operator regenera un slot sin regenerar la semana; warnings de largo on-screen/VO.
- Fuera V1: edición libre larga del guion por Cliente (correcciones vía Aprobación).
- Confirmado: S3.M6 (2026-08-27).

### Módulo: Caption Agent — Prioridad: P1
- El System automáticamente: por cada guion genera caption + hashtags + keywords locales + variantes CTA en `neuramark_reel_captions`; límites IG; auto en ciclo; schema-validate; plain text; LLM vía catálogo/tier.
- Cliente/Operator: ver en Aprobación; elegir variante CTA al aprobar.
- Confirmado: S3.M7 (2026-08-27).

### Módulo: Cost Policy Engine — Prioridad: P1
- Operator: configura `max_cost_cents` y `provider_tier` (low default); ve estimados; override auditado.
- System: check server-side pre-Job (costo acumulado del Reel); bloquea si supera tope; elige provider por economía/modo/asset role; seed ~150¢; Cliente nunca ve/envía costos; en ciclo el bloqueo va a cola Operator.
- Confirmado: S3.M8 (2026-08-27).

### Módulo: Video Provider Adapter — Prioridad: P1
- System: adapters únicos (`estimate/create/status/fetch`); jobs en `neuramark_video_jobs`; low-tier SadTalker/Wan + catálogo TTS/LLM; download-and-own; keys server-only; re-check consent+budget; auto en ciclo.
- Operator: estado/reintentos; upload manual (bypass costo, no QA); HeyGen = high/P1 no default.
- Confirmado: S3.M9 (2026-08-27).

### Módulo: Media Assembly Pipeline — Prioridad: P1
- System: ensambla Reel 9:16 (TTS + visual + timing) vía FFmpeg args-array → `neuramark_assembled_reels`; aplica `editing_hints` del formato/tendencia (ej. cold open + rewind); subtítulos/logo/cover; TTS catálogo EN/ES (CosyVoice2 low); solo `media_assets` propios; auto en ciclo → QA.
- Cliente/Operator: preview; voz desde catálogo limitado.
- Confirmado: S3.M10 (2026-08-27).

### Módulo: QA/Compliance Agent — Prioridad: P1
- System: post-ensamblado checks (tono, claims, claridad, CTA, disclosure IA, avatar); `neuramark_qa_reports`; blocking vs overridable; gate a Aprobación; auto en ciclo.
- Operator: override overridable con motivo (append-only); no override legal (consent/impersonación).
- Confirmado: S3.M11 (2026-08-27).

### Módulo: Approval Flow — Prioridad: P1
- Cliente: preview paquete; aprobar → Publicación IG; pedir cambios (máx 1 ronda/Reel); rechazar → System pregunta si generar nueva; ronda agotada → Operator.
- System: gate ensamblado+QA; state machine `pending_client`→`approved`|`rejected`|`changes_requested`; rechazados fuera de publish queue.
- Confirmado: S3.M12 (2026-08-27).

### Módulo: Instagram Publish (Reels API) — Prioridad: P1
- Cliente/Operator: conectar IG Business (token server-only); tras Aprobación publicar ahora o programar; ver estado/permalink; reintentar fallos; descarga respaldo.
- System: Graph Reels (container→publish, patrón karidecor→video); re-check `approved`; ejecuta programadas; persiste media_id/permalink/errores.
- Confirmado: S3.M13 (2026-08-27).

### Módulo: Ciclo semanal automatizado (scheduler) — Prioridad: P1
- System: cron por Cliente `active` con onboarding listo; auto-avance Estrategia→…→QA→cola Aprobación; no publish sin Aprobación; idempotente por Cliente/semana; fallos a Operator.
- Operator: disparo manual; pausar/skip semana por Cliente.
- Confirmado: S3.M14 (2026-08-27).

### Módulos P2 — Content Calendar + Metrics Lite
- **Content Calendar (P2):** vista semanal Operator; estados hasta published; huecos &lt;3 Reels; `published` desde Instagram Publish; mark published manual = fallback.
- **Metrics Lite (P2):** Operator carga views/likes/comments/saves/DMs; System inyecta resumen ~4 semanas en siguiente Estrategia.
- Confirmado: S3.M15 (2026-08-27).

### Stories (HL) — fuera de V1
- Confirmado S3.M16: no se construye pipeline de Stories en V1; solo Reels (3/semana).

---

## 4. Flujos de Usuario
*Pasos exactos de cada acción crítica. Happy path + error path.*

Flujos críticos confirmados (S4.LOTE):
1. Onboarding → entrevista → ficha → preferencias visuales → conectar IG
2. Ciclo semanal auto hasta cola Aprobación
3. Aprobación (aprobar / 1 ronda cambios / rechazar+¿nueva?)
4. Publicación IG (ahora o programada)
5. Excepciones Operator

### Error paths — confirmado S4.Q1
- **Generación falla:** Cliente ve retraso/neutro; Operator ve job failed + reintentar / override budget / upload manual.
- **QA blocking legal:** no llega a Aprobación; Operator ve bloqueo; sin override.
- **Publicación IG falla:** Cliente “reintenta o reconecta Instagram”; Operator error sanitizado + retry.
- **Ciclo parcial:** Reels OK → Aprobación; fallidos pendientes para Operator.
- Reintentos auto limitados; luego cola Operator.

---

## 5. Arquitectura
*Estructura técnica. Decisiones grandes → ADR.*

- **Plataforma:** Web — Next.js App Router (FE+BE) en **Vercel**
- **Datos:** Supabase Postgres; prefijo `neuramark_*`; acceso solo desde server
- **Auth:** Supabase Auth vía Next; cookies httpOnly; `getCurrentUser()`
- **Video providers:** adapters `lib/providers/`; tier low default; download-and-own
- **Instagram:** Graph Business Reels; tokens server-only (ADR-0002)
- **Scheduler:** Vercel Cron → Route Handler con `CRON_SECRET` → encola ciclo (ADR-0001)
- **Trabajo largo / FFmpeg:** worker Docker en **Fly.io** (ADR-0003); lee/escribe jobs en Supabase
- **ADRs:** 0001 Ciclo semanal · 0002 Publish Reels · 0003 Worker Fly.io

Confirmado: S5.LOTE + S5.Q1 (2026-08-27).

---

## 6. Requisitos No Funcionales
*Las restricciones invisibles que destruyen proyectos en producción.*

- **i18n:** EN + ES desde V1.
- **Datos sensibles:** likeness, consent ledger, tokens IG/providers, presupuesto — solo server; consent append-only; rate limits auth.
- **Offline:** no requerido V1 (online-only).
- **Hosting:** app Vercel · worker Fly.io (FFmpeg/pipelines) · DB Supabase (`neuramark_*`).
- **Reglas duras:** sin grabación humana; sin publish sin Aprobación; sin impersonación genérica; budget-before-generate; etc. (ver §1 y SECURITY_BASELINE).
- **Concurrencia V1 (confirmado S6.Q1):** objetivo operativo **1 Cliente activo** (uso interno). Sin optimizar para carga: jobs de generación/ensamblado pueden ejecutarse en **serie o con paralelismo mínimo** (hasta 3 slots semanales, sin presión de throughput).
- **Escalabilidad sin reescribir:** arquitectura **multi-tenant desde día 1** (`client_id` en todas las entidades de negocio); cola de jobs en Supabase; worker Fly.io **stateless** (escala horizontal añadiendo máquinas / `fly scale`); límites de concurrencia vía **config/env**, no hardcode en lógica de dominio; Vercel app layer sin estado de pipeline.
- **Región y residencia (confirmado S6.Q2):** Supabase **`us-east-1`** (Virginia); worker Fly.io **`iad`** (misma región); Vercel auto (server cercano); assets (video/audio) en Supabase Storage misma región. Jurisdicción consentimiento likeness: **US + país del Cliente** cuando haya clientes externos; V1 = uso interno.
- **SLA V1 (confirmado S6.Q3):** sin SLA contractual. Objetivos operativos internos:
  - **App web:** best-effort (sin uptime garantizado).
  - **Ciclo semanal:** tras cron, los 3 Reels en cola de Aprobación en **≤ 24 h** (salvo fallo de provider).
  - **Primer lote:** SC-3 — **≤ 7 días** tras completar onboarding.
  - **Publicación IG:** inmediata o programada según Cliente; sin SLA de latencia de Meta.
  - **Recuperación:** fallos visibles al Operator; reintentos automáticos limitados → cola manual.

Confirmado lote: S6.LOTE (2026-08-28). Confirmado: S6.Q1–S6.Q3 (2026-08-28). **Sección 6 completa.**

---

