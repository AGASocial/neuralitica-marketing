# SYSTEM-MAP — neuralitica-marketing

> Mapa generado desde material aportado (`plan/`), modo `nuevo-con-material` (sf-brief).
> Evidencia = fuente del brief (no `archivo:línea` de código).
>
> Generado: 2026-08-27 · Fuentes: 8 archivos en `plan/` · Precedencia: USER_STORIES + SECURITY_BASELINE > MODULES_ROADMAP_v1.1 + PROVIDER_TIERS > HIGH_LEVEL_PLAN.md > DESIGN_PROMPTS > HTML legacy
> Verificación adversarial: parcial (contradicciones de módulos marcadas)

## Inventario (fase 0 — material)

- **Material:** `plan/HIGH_LEVEL_PLAN.md`, `plan/USER_STORIES.md`, `plan/SECURITY_BASELINE.md`, `plan/DESIGN_PROMPTS.md`, `plan/MODULES_ROADMAP_v1.1.html`, `plan/PROVIDER_TIERS.html`, HTML legacy (`HIGH_LEVEL_PLAN.html`, `MODULES_ROADMAP.html`)
- **Stack declarado en material:** Next.js (FE+BE) · Supabase Postgres · Vercel · EN/ES · PrimeReact (UI guidance)
- **Código app actual:** no mapeado en este modo (solo brief); hay esqueleto Next.js con dashboard

## Afirmaciones por ranura

### Ranura 1 — Visión del Producto

- [confirmado] Producto V1: sistema agéntico de marketing **Instagram video-first** para prestadores de servicios locales (plomeros, barberos, electricistas, etc.) — evidencia: `HIGH_LEVEL_PLAN.md` §1–3
- [confirmado] Promesa: el cliente responde una entrevista inicial, aprueba el contenido; el sistema genera videos, captions, stories y CTAs con avatar propio, genérico o sin rostro — evidencia: `HIGH_LEVEL_PLAN.md` §2
- [confirmado] El cliente **no graba**; solo entrevista + datos + aprobación — evidencia: `MODULES_ROADMAP_v1.1.html`; `USER_STORIES.md` Conventions
- [confirmado] Volumen MVP: **3 Reels IA / semana** (escalar luego a 5); Stories/captions/hooks/CTAs/covers en entregables HL — evidencia: `HIGH_LEVEL_PLAN.md` §7; roadmap
- [confirmado] Fuera de alcance V1: TikTok, YouTube, LinkedIn, Blog, Ads, CRM avanzado, dashboard complejo, publicación automática obligatoria, automatización completa de DMs, edición avanzada propietaria — evidencia: `HIGH_LEVEL_PLAN.md` §10
- [ausente] Criterios de éxito medibles de producto (retención, tiempo a primer Reel, tasa de aprobación, conversión a DMs) — el material da metas de costo y un corte MVP por stories, no KPIs de negocio formales

### Ranura 2 — Usuarios y Casos de Uso

- [confirmado] Rol **Client**: prestador local; onboarding/entrevista, ficha, modo visual/consentimiento, aprobación de piezas — evidencia: `USER_STORIES.md` Conventions Roles
- [confirmado] Rol **Operator**: producción interna (estrategia, jobs, QA, publicación asistida); flag `neuramark_clients.role` = `client` \| `operator` (SQL, sin UI RBAC) — evidencia: `USER_STORIES.md` Auth; `SECURITY_BASELINE.md` §Authentication
- [confirmado] Rol **System**: agentes/pipelines automáticos — evidencia: `USER_STORIES.md` Conventions
- [confirmado] Signup abierto → confirmación email → `active=false` → activación SQL; inactivo no usa endpoints de pago/generación — evidencia: Auth / Security
- [ausente] Acciones exactas “solo operator” vs client consolidadas en una lista corta de entrevista (están dispersas en stories)
- [ausente] Comportamiento de usuario anónimo (landing/marketing vs app) más allá del flujo auth

### Ranura 3 — Funcionalidades por Módulo

**Precedencia de módulos:** usar **13 módulos de `MODULES_ROADMAP_v1.1` + Authentication (stories)**. El §8 de `HIGH_LEVEL_PLAN.md` (11 módulos + “Video Generator Connector”) está **parcialmente supersedido**.

| Módulo | Función | Prioridad material | Evidencia |
|---|---|---|---|
| Authentication | Login/signup/reset; `getCurrentUser()` | P0 | `USER_STORIES.md` US-14.x |
| Interview Builder | Entrevista guiada | P0 | roadmap Fase 1 |
| Business Profile | Ficha viva canónica | P0 | roadmap Fase 1 |
| Avatar / Visual Mode Selector | own / generic / faceless + consentimiento | P0 | roadmap Fase 1 |
| Content Strategy Agent | Pilares/temas/secuencia semanal IG | P0 | Fase 2 |
| Video Script Agent | Hooks, guiones, CTAs, texto en pantalla | P0 | Fase 2 |
| Caption Agent | Captions, hashtags, keywords, CTAs | P0 | Fase 2 |
| Cost Policy Engine | Presupuesto/tier por pieza | P0 | Fase 3 |
| Video Provider Adapter | Adaptadores intercambiables (SadTalker/MuseTalk/Wan/HeyGen/manual) | P0 | Fase 3 |
| Media Assembly Pipeline | Voz + avatar/B-roll + subtítulos + logo + 9:16 + cover | P0 | Fase 3 |
| QA/Compliance Agent | Tono, claims, avatar, disclosure IA, claridad, CTA | P0 | Fase 4 |
| Approval Flow | Aprobar / pedir cambios / rechazar | P0 | Fase 4 |
| Content Calendar | Calendario semanal ops | **P1** | Fase 5 |
| Metrics Lite | Métricas básicas → aprendizaje | **P1** | Fase 5 |

- [confirmado] Corte MVP usable: hasta Approval Flow + Auth; Calendar/Metrics pueden quedar manuales — evidencia: `USER_STORIES.md` MVP cut; roadmap §Primer MVP usable
- [confirmado] Cross-cutting P0: Dashboard entrada default, i18n EN/ES, seam `getCurrentUser()`, seed catálogo providers — evidencia: US-X.1–X.4
- [confirmado] Contradicción docs: HL §8 vs v1.1 (11 vs 13; Connector vs Cost/Adapter/Assembly) — evidencia: ambos docs
- [ausente] Etiquetas P2/P3 estilo SpecFounder (el material solo usa P0/P1)
- [ausente] Volumen Stories (5/semana en HL) vs stories muy centradas en Reels — cobertura de Stories en MVP

### Ranura 4 — Flujos de Usuario

- [confirmado] Flujo operativo (material): … → Aprobación → publicación — evidencia: `HIGH_LEVEL_PLAN.md` §6
- [confirmado] (entrevista S2.Qa2) Tras Aprobación: **Publicación en Instagram** de Reels vía Graph/Business API — botón y/o programada; nunca sin Aprobación. Patrón ref: karidecor `lib/instagram` adaptado a video — evidencia: decisión usuario 2026-08-27
- [confirmado] Cadena económica: Script/caption (LLM) → TTS → talking-head o B-roll → media_assets → FFmpeg → QA → Approval — evidencia: `PROVIDER_TIERS.html`; US-8/9
- [confirmado] Aprobación: al menos 1 ronda de revisión en V1; no publicar sin aprobación — evidencia: US-11; reglas duras
- [confirmado] (entrevista S1.Qa1) Pedir cambios = 1 ronda/Reel; Rechazar = preguntar si generar nueva pieza; Aprobar → listo para Publicación en Instagram — evidencia: decisión usuario 2026-08-27
- [confirmado] Consentimiento avatar propio = ledger append-only; re-check en creación de job; revocación cancela jobs en cola — evidencia: `SECURITY_BASELINE.md`; US-3
- [confirmado] (entrevista S2.Qa1) Ciclo semanal automatizado (cron): Estrategia + generación hasta Aprobación; Operator = supervisión + disparo manual opcional — evidencia: decisión usuario 2026-08-27
- [ausente] Error paths detallados por proveedor video (timeouts, reintentos, fallbacks) más allá de US-8.4
- [ausente] Error paths de publicación Instagram (token expirado, container fail, permisos Reels)
- [ausente] Happy/error path unificado “cliente ve X cuando falla generación o publicación”

### Ranura 5 — Arquitectura

- [confirmado] Next.js FE+BE, Supabase Postgres (`neuramark_*`), Vercel — evidencia: `USER_STORIES.md` Stack; Security
- [confirmado] Supabase solo desde backend Next; sin SDK/keys en browser; Server Actions / Route Handlers — evidencia: Conventions; Security
- [confirmado] Identidad solo vía `getCurrentUser()`; usuario hardcodeado local hasta Auth — evidencia: US-X.3 / US-14.5
- [confirmado] Providers bajo `lib/providers/`; sin llamadas vendor directas desde handlers — evidencia: Security; PROVIDER_TIERS
- [confirmado] Tier default V1 = **low**; clientes no eligen tier; orden upgrade: avatar → B-roll → TTS → LLM — evidencia: USER_STORIES; PROVIDER_TIERS
- [confirmado] Stack low: SiliconFlow (LLM/TTS/Wan), Replicate SadTalker (+ MuseTalk), FFmpeg, upload manual fallback; HeyGen = fallback operator P1, no default silencioso — evidencia: Conventions; PROVIDER_TIERS
- [confirmado] Presupuesto antes de generar (`max_cost_cents`, seed ~150); autoridad de gasto solo server-side — evidencia: roadmap; US-7; Security
- [confirmado] Assets: download-and-own; storage detrás de interfaz (S3 futuro) — evidencia: Security

#### Inventario de APIs / integraciones consumidas

| Nombre | Uso | Auth / notas | Evidencia |
|---|---|---|---|
| Supabase Auth | signup/login/reset/sesiones | server-only, cookies httpOnly | Security / US-14 |
| Supabase Postgres | datos `neuramark_*` | service-role server | Stack |
| SiliconFlow | LLM, CosyVoice2 TTS, Wan2.1 B-roll | API key server-env | PROVIDER_TIERS |
| Replicate | SadTalker / MuseTalk | API key server-env | PROVIDER_TIERS |
| HeyGen | talking-head high / fallback P1 | API key; no default V1 | US-8.7 |
| ElevenLabs / OpenAI / Anthropic / LTX / Kling | high-tier P1 | server-env | PROVIDER_TIERS |
| FFmpeg | ensamblado local | spawn args array | Security / US-9 |
| Instagram Graph / Business | Publicación de **Reels** + permalink | Access token server-side; patrón karidecor adaptado a video | S2.Qa2 / ADR-0002 |
| Manual upload | escape hatch operator | auth app | US-8.3 |

- [ausente] Contratos detallados request/response por endpoint de cada proveedor (solo catálogo/tiers)
- [ausente] SLA propio vs SLA de terceros
- [ausente] Billing/Stripe hacia el cliente (costo es tracking interno de margen)

### Ranura 6 — Requisitos No Funcionales

- [confirmado] Reglas duras: no grabación obligatoria; no publish sin approval; consentimiento avatar propio; no impersonación con genérico; no resultados garantizados; no claims peligrosos sin revisión; no DMs sensibles auto; no multicanal; no ads para validar; operación simple — evidencia: `HIGH_LEVEL_PLAN.md` §9; roadmap reglas
- [confirmado] Sensibilidad máxima: likeness + consentimientos; provider keys; presupuesto; estado approval/QA — evidencia: Security
- [confirmado] Rate limits auth vía `neuramark_auth_attempts`; password ≥12 ≤128; cookies Secure+SameSite=Lax — evidencia: Security
- [confirmado] i18n EN+ES desde el inicio — evidencia: US-X.2
- [confirmado] Targets de costo (investigación): ~$0.37–0.58 / Reel 30s low; ~$1.10–1.75 / cliente / semana — evidencia: Conventions; PROVIDER_TIERS (no son SLA contractuales)
- [ausente] Concurrencia v1 (¿cuántos clientes/jobs simultáneos?)
- [ausente] Offline
- [ausente] Hosting región / residencia de datos / jurisdicción legal del consentimiento likeness
- [ausente] SLA uptime/latencia del producto

## Términos candidatos al glosario

| Término | Fuente | Evidencia | ¿Sinónimos detectados? |
|---|---|---|---|
| Cliente | roles | USER_STORIES Conventions | "prestador", "dueño", "usuario" |
| Operator | roles | USER_STORIES / Auth | "admin", "interno" |
| Entrevista inicial | Interview Builder | HL §6; US Interview | "onboarding interview" |
| Ficha viva / Business Profile | Business Profile | HL §6; roadmap | "perfil de negocio" |
| Modo visual | Visual Mode Selector | HL §5; US-3 | "avatar mode", "visual preferences" |
| Avatar propio autorizado | modos | HL §5.1 | "own_avatar", "likeness" |
| Avatar genérico profesional | modos | HL §5.2 | "generic_avatar" |
| Video sin rostro | modos | HL §5.3 | "faceless" |
| Consentimiento de avatar | ledger | Security; US-3 | "consent", "autorización de imagen" |
| Estrategia semanal | Content Strategy | HL §6 | "weekly brief", "pilares/temas" |
| Paquete de guion | Video Script Agent | US Script | "script package", hooks/CTAs |
| Job de generación | Provider Adapter | US-8 | "generation job", "external_job_id" |
| Reel ensamblado | Media Assembly | US-9 | "assembled reel", "media_asset" |
| Veredicto QA | QA Agent | US-10 | "QA verdict", "blocking check" |
| Aprobación | Approval Flow | HL §6; US-11 | "approval decision", "revision round" |
| Política de costo | Cost Policy | US-7 | "max_cost_cents", "provider_tier" |
| Catálogo de providers | US-X.4 | PROVIDER_TIERS | "provider_key" |
| Publicación manual asistida | Publish | HL §6/§10 | "manual publish" |
| Métricas lite | Metrics Lite | US-13 | "Reel metrics" |

## Decisiones detectadas (candidatas a ADR)

1. Instagram-only, video-first V1 (no multicanal) — HL §3; reglas roadmap
2. Tres modos visuales; no grabación humana obligatoria — HL §5/§9
3. No publicar sin aprobación del Cliente — reglas duras
4. Consentimiento append-only + no impersonación (gates no sobreescribibles) — Security; US-3/10
5. Arquitectura de adaptadores de video (vendor-swappable) — roadmap; US-8.1
6. Economía low-tier por defecto (HeyGen no default silencioso) — USER_STORIES; PROVIDER_TIERS
7. Budget-before-generate; autoridad de gasto solo server — US-7; Security
8. Next.js + Supabase + Vercel; Supabase solo server; prefijo `neuramark_` — Conventions; Security
9. Único seam de identidad `getCurrentUser()` — US-X.3 / US-14.5
10. Signup + email confirm + activación SQL (`active`) — Auth; Security
11. Rol mínimo `client`\|`operator` (SQL), sin RBAC — Auth
12. Publicación manual asistida en V1 — HL §10; US-11/12
13. EN+ES desde el inicio — US-X.2
14. Download-and-own de assets — Security
15. Corte MVP: Approval + Auth; Calendar/Metrics P1 — USER_STORIES MVP cut

## Contradicciones material ↔ material

- **Lista de módulos:** `HIGH_LEVEL_PLAN.md` §8 (11 + Video Generator Connector) vs `MODULES_ROADMAP_v1.1` (13 + Cost/Adapter/Assembly) + Auth en stories — **resolver en entrevista**: canon = v1.1 + Auth
- **Stories volume:** HL promete 5 Stories/semana; backlog stories es Reel-céntrico
- **DESIGN_PROMPTS** (Inter/violeta/Sakai/cards): guía de mockups, no canon de producto salvo adopción explícita

## Cobertura y límites de este mapa

- Normalizado **todo `plan/`** según BRIEF.receive
- No se exploró el código de `app/` / `lib/` (modo nuevo-con-material)
- No se copiaron schemas completos de providers; solo inventario resumido
- USER_STORIES (~1191 líneas) destilado por módulos/prioridades, no story-a-story en el mapa
- Precios de providers son snapshot de investigación; el material pide validar precios en vivo
