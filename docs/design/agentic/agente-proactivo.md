# Neuralitica: el agente como community manager independiente y proactivo
*(4 nov 2026. Repo leído solo en modo lectura en el Mac mini; no se cambió nada.)*

## 1. Estado actual del repo
**Modelo de chat y AI Gateway: sí se usa.**
- `lib/orchestrator-chat/model.ts` → `gateway(modelId)` de `ai` (`ai@^7.0.162`, `@ai-sdk/gateway@^4.0.135`). El modelo por defecto es **`google/gemini-2.5-flash`** (ADR-0009) y se puede cambiar con `ORCHESTRATOR_CHAT_MODEL`.
- Los proveedores del pipeline también pasan por el Gateway: `ai_gateway_gemini_flash_lite` (LLM), `ai_gateway_seedance_broll`, `ai_gateway_heygen_avatar` (`heygen/heygen-video-1`), con `AI_GATEWAY_API_KEY` (`lib/contracts/ai-gateway-video.ts`, migraciones `20261103…ai_gateway_*`). Las claves legacy (SiliconFlow/Wan) quedan como fallback.

**Schedulers que existen**
- `vercel.json`: `/api/cron/weekly-cycle` **lunes 06:00 UTC** (`0 6 * * 1`) y `/api/cron/video-jobs` **cada minuto**.
- Fly (`fly.toml`, app `neuralitica-marketing-worker`): 3 procesos que **hacen polling a Supabase** sin HTTP: `video` (shared-cpu-1x 512 MB), `assembly` y `branding` (1 GB).
- No encontré pg_cron en las migraciones de Supabase.

**Orquestación ya construida (US-15.1 “Phase B”)**: una máquina de estados durable hecha a mano en Postgres:
- Tablas `neuramark_weekly_cycle_runs`, `…_step_runs`, `…_outbox`.
- Pasos: `strategy → scripts → captions → primary_video → tts → broll → assembly → branding → qa → approval`.
- Patrón outbox con claims y CAS, claves de idempotencia, `MAX_WEEKLY_CYCLE_ATTEMPTS = 3` con backoff de 30 s y 120 s, reconciliación, y reanudación desde el job (`resume-weekly-cycle-from-job`).
- La estrategia se **auto-aprueba** para el ciclo de sistema (`auto-approve-weekly-cycle-strategy.ts`).
- Hay tablas de presupuesto (`cost_policies`, `reel_spend_events`, `budget_audit_log`, `provider_decisions`).

**¿Qué corre solo cada semana hoy?**
- El cron del lunes **sí** recorre los clientes elegibles (activos, con perfil y modo visual). Pero el modo **live** está detrás de 3 variables: `WEEKLY_CYCLE_LIVE_ENABLED=true`, la allowlist `WEEKLY_CYCLE_LIVE_CLIENT_IDS` y `WEEKLY_CYCLE_LIVE_MAX_CLIENTS` (default 3, máximo 25). Sin ellas, el batch es **dry-run** (solo planifica).
- Con live activado, genera la estrategia, guiones, captions, videos, ensamblado, branding y QA, y **termina dejando el reel en la cola de aprobación**.
- **No** hay publicación automática en Instagram. No encontré código de la Graph API, más allá de un test estructural que lo vigila.
- **No** hay notificaciones al dueño. El único correo es el de auth (Resend) para registro y reseteo de contraseña. Tampoco hay push ni WhatsApp.
- **Tampoco** hay recordatorios ni escalamiento.
- Todo lo demás (chat, cambios, aprobar) ocurre solo cuando el usuario hace clic.

> En resumen: ya existe ~70 % del “agente proactivo” en el backend (un ciclo semanal durable, idempotente y con topes). Lo que falta es **el último tramo**: avisar, esperar la aprobación, recordar, programar o publicar, y volver a empezar. Y quitar el límite de 25 clientes en la allowlist.

## 2. El stack de agentes de Vercel (2026)
- **Workflows / Workflow SDK (WDK, v5):** GA desde abril de 2026.
  - `"use workflow"` / `"use step"`. Cada paso se cachea y se reintenta, y sobrevive a crashes y deploys.
  - `sleep()` de minutos a meses **sin cómputo** y sin duración máxima de run.
  - `createHook()` + `resumeHook(token)` para aprobación humana con token determinista (p. ej. `approval:{clientId}:{week}`). `createWebhook()` sirve para callbacks de proveedores.
  - `FatalError` / `RetryableError({retryAfter})`, runs hijos con `start()`, streams, observabilidad en el dashboard.
  - `WorkflowAgent` (`@ai-sdk/workflow`) es el loop del AI SDK hecho durable.
  - Límites: 10k pasos por run, 25k eventos por run, replay de 240 s, payload de 50 MB.
- **Queues (beta):** colas durables con at-least-once. Workflows las usa por debajo.
- **eve:** framework open source de agentes durables. Cada sesión es un workflow y trae canales, aprobaciones, subagentes, sandbox y evals. Puede delegar trabajo pesado a Queues y **Daemons** (beta: solo producción y sin autoescalar).
- **Sandbox:** microVMs para código no confiable. No lo necesitamos (ffmpeg ya vive en Fly).
- **AI Gateway:** ya lo usamos. Cobra el precio de lista del proveedor por tokens.
- **Vercel Cron:** el disparador que ya usamos.
- **Connect / Drives:** no abrí su documentación en esta sesión. Por el nombre parecen ser credenciales delegadas para terceros (Meta/Instagram) y almacenamiento de archivos. Vale la pena revisarlos cuando llegue la publicación en Instagram, pero no los evalué.

## 3. ¿Alcanza con un cron simple + nuestro worker?
**Sí se puede lograr la misma proactividad visible** si le agregamos al sistema actual:
1. Un paso `notify` al llegar a `approval`.
2. Un cron horario de “recordatorios y escalamiento” que mire las aprobaciones pendientes y sus fechas límite.
3. Un endpoint de aprobación que reanude el run (ya existe `resume-weekly-cycle-run`).
4. Un paso `schedule/publish`.
5. Un cron de publicación por slot.
De hecho, el outbox y el CAS actuales ya resuelven idempotencia y reintentos.

**Lo que le falta frente a Workflows:**
- **La espera es implícita.** “Esperar aprobación 48 h, recordar, escalar a las 72 h y auto-aprobar si el dueño lo permite” se vuelve estado en tablas más varios crons que hacen polling, no código lineal. Cada regla nueva implica una migración y más casos de reconciliación.
- **Mantenimiento.** Hoy hay ~40 archivos de orquestación más tests para lo que en WDK serían ~150 líneas. El riesgo de bugs de concurrencia (claims vencidos, CAS) es nuestro.
- **Latencia y costo del polling.** El cron de cada minuto y los workers de Fly siempre encendidos se pagan aunque no haya trabajo. Workflows despierta solo con eventos (hooks/webhooks del proveedor).
- **Observabilidad.** No hay una vista por run con pasos, reintentos y esperas. Habría que construirla. WDK la trae.
- **Ventana por semana.** Un cron fijo los lunes no permite que cada negocio tenga su día u hora, ni “dormir hasta la próxima semana desde que se aprobó”.

**Lo que conserva el cron simple:** cero dependencias nuevas, todo en Supabase (auditable con SQL), sin lock-in en Vercel y ya probado con tests.

## 4. Arquitectura propuesta: “manager semanal durable”
```
cron lunes (o al activar la campaña) → start(campaignManager, [clientId])   // un run largo por negocio
campaignManager(clientId):  "use workflow"
  loop semanal:
    policy = loadPolicy()                         // step: presupuesto, auto-aprobación, canales
    if gastoMes + estimado > tope → notify("subir tope?") + hook → si no, sleep hasta el próximo mes
    plan    = generarEstrategia()                 // step (Gateway: gemini-2.5-flash)
    guiones = generarGuiones(plan)                // step
    reels   = producirReels(guiones)              // steps → encolan en Fly; esperan createWebhook() del worker/proveedor
    qa      = correrQA(reels)
    if policy.autoAprobar && qa.ok && costo < umbral → aprobado
    else:
      notify(owner, tarjeta)                      // push/email/WhatsApp + feed “Hoy”
      decision = await Promise.race([hook(`approval:${clientId}:${week}`), sleep("24h")])
      si no hubo respuesta → recordatorio; 48h → 2.º canal; 72h → plan B (auto si la política lo permite, o saltar slot)
    programar/publicar(slots)                     // step idempotente por slot
    sleep(hasta lunes siguiente 6:00 hora local)
```
**Guardrails**
- Topes de gasto por negocio (por mes y por reel), revisados **antes** de cada paso que gasta. Ya existen `cost_policies` y `reel_spend_events`.
- Reglas definidas por el dueño: “auto-aprobar si cuesta < $X y el QA pasa”, “pedirme OK siempre para publicar” o “solo avísame”.
- Idempotencia: la clave por paso `{clientId}:{week}:{slot}:{step}` se mantiene. Los providers reciben un idempotency key.
- Reintentos: `RetryableError` con backoff; `FatalError` → notificar a operaciones, no al dueño.
- Kill switch y allowlist actuales: leerlos en cada step.
- Notificar **solo** cuando hay decisión, error que requiere acción o resumen semanal opcional. Una sola tarjeta por lote (“3 reels listos”).

**Qué se queda igual:** Supabase sigue siendo la fuente de verdad del negocio (reels, aprobaciones, gasto). El worker de Fly sigue con ffmpeg, ensamblado y branding. El Gateway sigue para LLM y video.

## 5. Costos mensuales estimados
**Supuestos** (por negocio y por mes ≈ 4.3 semanas):
- 3 reels por semana.
- LLM del ciclo: ~6 llamadas por semana × (8k tokens de entrada + 2k de salida).
- Chat: ~50 turnos × (6k de entrada + 0.5k de salida).
- ~400 eventos de workflow.
- ~15 correos.
- Precios de `gemini-2.5-flash` en el Gateway: $0.30/M tokens de entrada y $2.50/M de salida.

| Concepto | Por negocio | 10 | 100 | 1,000 |
|---|---|---|---|---|
| LLM ciclo semanal (plan, guiones, captions, QA) | ~$0.19 | $1.9 | $19 | $190 |
| LLM chat del dueño | ~$0.15 | $1.5 | $15 | $150 |
| **Opción Workflows:** eventos ($0.02/1k) + datos escritos y retenidos ($0.50/GB) | ~$0.01 | ~$0 (cabe en lo incluido) | ~$1 | ~$12 |
| Queues (desde $0.60/M operaciones) | ≈$0 | $0 | <$1 | ~$1–3 |
| Functions (pasos cortos; Fluid, CPU activa) | centavos | ~$1 | ~$5 | ~$30–60 |
| **Opción cron + Fly:** workers siempre encendidos (512 MB $3.69 + 2×1 GB $6.70) | fijo | $17 | $17–35 | ~$70–140 (escalar 4–8×) |
| Cron de cada minuto (43k invocaciones/mes) | fijo | ~$1 | ~$1 | ~$2 |
| Email (Resend: Free 3k/mes → Pro $20 por 50k) | ~$0 | $0 | $0–20 | $20 |
| Push web | $0 | $0 | $0 | $0 |
| WhatsApp (plantillas de Meta) | *precio no verificado* | | | |
| **Subtotal sin video, opción Workflows** (+ Fly, que sigue para ensamblado) | | **~$22** | **~$60** | **~$450–600** |
| **Subtotal sin video, opción cron + Fly** | | **~$21** | **~$55** | **~$430–560** |
| **Video (línea aparte):** HeyGen vía Gateway a 1¢/s × 3 reels × 15 s + Seedance B-roll a 5¢/clip × 9 + TTS | **~$3.5–5** | $35–50 | $350–500 | $3.5k–5k |

*Los precios de video vienen de las constantes del repo (`AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND=1`, `AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP=5`); verifícalos contra la factura real. No incluyen Kling ni HeyGen directo v3, ElevenLabs, el plan base de Vercel Pro ni Supabase.*

**Lectura:** la diferencia de costo de infraestructura entre las dos opciones es **marginal** (decenas de dólares a 1,000 negocios). Lo que domina son el **video** (~90 %) y el LLM. La decisión es de **mantenibilidad y producto**, no de costo.

## 6. Recomendación
- **Workflow SDK: SÍ**, solo para la capa de “manager” (loop semanal, esperar aprobación, recordatorios, escalamiento, publicar, dormir). Se adopta de forma incremental, **envolviendo** los pasos existentes (`generateContentStrategyForClient`, etc.) como `"use step"`, sin reescribirlos.
- **Queues: no directamente.** Las usa WDK por debajo. Fly + Supabase siguen haciendo la producción pesada.
- **eve: después.** Valdría la pena si el chat del dueño y el manager se vuelven **la misma sesión** con canales (WhatsApp/Slack) y aprobaciones integradas. Hoy el chat ya funciona con AI SDK y eve agregaría un framework nuevo.
- **Sandbox / Daemons: no** por ahora.
- **Cron simple: aceptable como fase 1** si se quiere salir ya. Cubre notificar, recordar y publicar, pero acumula deuda en cada regla de espera nueva.

## 7. Plan por fases
1. **F0 (1 semana), cerrar el ciclo con lo actual:** paso `notify` (email con Resend + push web + tarjeta en “Hoy”) al entrar en `approval`; cron horario de recordatorios y escalamiento; activar live para 3–5 clientes piloto.
2. **F1 (2 semanas), WDK piloto:** `withWorkflow` en `next.config.ts`; `campaignManager` que **llama** a `runWeeklyCycleForClient` como paso y luego hace `createHook` de aprobación, recordatorios con `sleep` y `sleep` hasta la próxima semana. El endpoint de aprobar llama a `resumeHook`. Correrlo en paralelo con el cron (feature flag por cliente).
3. **F2, migrar la orquestación:** pasar los pasos async (video, ensamblado, branding) a `createWebhook()`, con el worker de Fly avisando al terminar. Retirar el polling del outbox y el cron de cada minuto. Agregar políticas de auto-aprobación definidas por el dueño en “Mi negocio”.
4. **F3, publicación:** integrar la publicación en Instagram (Graph API; evaluar Vercel Connect para el OAuth de Meta), con un paso idempotente por slot y métricas en el resumen semanal.
5. **F4, opcional:** evaluar eve o `WorkflowAgent` para unir chat y manager y sumar WhatsApp como canal.

**Riesgos:**
- Lock-in en Vercel (mitigable: WDK es open source con “Worlds” alternativos).
- Determinismo del código del workflow: toda E/S debe ir en steps.
- Versionado de runs largos al hacer deploy (usar Skew Protection, o loops semanales cortos que se relanzan como run hijo por semana).
- Doble fuente de estado durante la migración.
- Notificaciones demasiado frecuentes (agrupar por lote).

**Qué medir:**
- % de semanas con ≥3 reels listos sin intervención.
- Latencia de aprobación.
- % de auto-aprobaciones.
- Notificaciones por dueño por semana (meta: ≤2).
- Costo por reel frente al tope.

## Fuentes
**Abiertas en esta sesión:** https://workflow-sdk.dev, más el skill `workflow` (documentación de WDK v5 que viene en el plugin).
**Leídas vía extractos del buscador:**
- https://vercel.com/docs/workflows
- https://vercel.com/docs/workflows/pricing
- https://vercel.com/kb/guide/background-workers-on-vercel
- https://vercel.com/docs/agent-harnesses/eve
- https://vercel.com/blog/introducing-eve
- https://vercel.com/docs/queues/pricing
- https://vercel.com/pricing
- https://vercel.com/ai-gateway/models/gemini-2.5-flash
- https://vercel.com/docs/ai-gateway/pricing
- https://resend.com/pricing
- https://docs.fly.io/about/pricing
**Repo:** `vercel.json`, `fly.toml`, `lib/orchestrator-chat/model.ts`, `lib/contracts/orchestrator-chat.ts`, `lib/contracts/ai-gateway-video.ts`, `lib/orchestration/*`, `supabase/migrations/*`.
