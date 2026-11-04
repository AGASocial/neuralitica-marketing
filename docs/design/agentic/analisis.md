# Neuralitica Marketing: hacer la UI agentic-first

## 1. Qué está pasando en 2025-2026 (tendencias y ejemplos)
| Patrón | Ejemplos | Qué tomar para Neuralitica |
|---|---|---|
| **Chat como pantalla principal + canvas/lienzo** | ChatGPT Canvas, Claude Artifacts, v0, Lovable, Bolt, Manus, Genspark, HubSpot Breeze (canvas junto al chat, may-2026) | La conversación genera artefactos (reels, posts, calendario) que viven en un lienzo con versiones (v1, v2) |
| **La vista previa ES el mensaje** | v0 (el preview es el siguiente mensaje), ChatGPT Apps SDK / MCP Apps (tarjetas inline, máx. 2 acciones), MCP-UI de Shopify | Tarjetas de aprobar/cambiar con el video incrustado y solo 2 botones: **Aprobar** y **Cambiar** |
| **Feed proactivo en el Home** | Shopify Sidekick Pulse (hasta 5 tarjetas de acciones sugeridas en Home; nada se aplica sin aprobación), Intercom Fin, Linear (agentes que reportan en el issue) | Pantalla "Hoy": lo que hizo el agente y lo que necesita tu OK |
| **Bandeja de aprobaciones por riesgo, en lote, con deshacer** | Cursor/Claude Code (permisos por niveles), patrones de Setproduct/affectUI, Copilot coding agent (todo en un PR) | "Aprobar los 3 de la semana" en un toque; publicar = acción de riesgo, responder comentarios = en lote; "deshacer" 6 s |
| **Plan visible y timeline de progreso** | Manus, Perplexity (pasos), ChatGPT Agent, Genspark | Lista "Lo que hice anoche ✓ / ◌ esperando" |
| **Barra de comando / compositor siempre visible** | Cursor (⌘K), Notion AI, Linear, Raycast | Compositor grande, fijo, con ⌘J, no un botón flotante |
| **Agente inline en cada página** | Notion AI, Linear, Shopify Sidekick, CopilotKit (copilot contextual), Vercel AI SDK generative UI | En Mis videos/Calendario el mismo compositor sabe en qué página estás ("cambia este video") |
| **Sugerencias de prompts (chips)** | ChatGPT, Perplexity, Jasper, Predis.ai | Chips contextuales: "Aprobar todo", "Hazlo más gracioso", "¿Cómo me fue?" |
| **Voz** | ChatGPT Voice, Gemini Live, Breeze móvil | Botón de micrófono grande: el plomero habla desde la camioneta |
| **Preguntas aclaratorias como tarjeta** | HubSpot Breeze (una sola pregunta interactiva con opciones) | Si falta un dato, una tarjeta con opciones, no un formulario |

Herramientas de marketing con IA (Jasper, Predis.ai, Ocoya) siguen siendo mayormente *dashboard + generador*: el chat es secundario. Esa es justo la oportunidad de diferenciación de Neuralitica.

**Diagnóstico actual:** el chat en panel lateral abierto con botón = patrón de "widget de ayuda" (estilo Intercom 2018). Comunica "aquí está la app, y si te pierdes hay ayuda". Agentic-first invierte eso: **el agente es quien trabaja; las páginas son donde revisas su trabajo.**

## 2. Opciones de layout

### A) Agente como home (chat principal + lienzo a la derecha)
Conversación en el centro, lienzo a la derecha con tarjetas de reels/posts por aprobar y métricas. Mockup: `opcion-a-agente-home.html`.
- **Pros (plomero):** cero curva; todo es "hablar"; muy claro que el agente manda; ideal para onboarding (formulario → plan en conversación).
- **Contras:** pantalla en blanco/hilo largo si el usuario no sabe qué pedir; difícil volver a "¿qué tengo pendiente?" cuando el hilo crece; el estado de la campaña queda enterrado en mensajes.
- **Móvil:** chat a pantalla completa, previews en carrusel horizontal dentro del hilo, compositor + micrófono abajo, tab bar.
- **Páginas actuales:** Inicio → se vuelve el chat; Mis videos/Mi campaña/calendario → el lienzo y pestañas secundarias; aprobaciones → tarjetas en el hilo + contador en el lienzo.

### B) Feed/inbox proactivo + barra de chat abajo
Home = lista cronológica: "Publiqué X", "Necesito tu OK en Y". Chat solo como barra inferior.
- **Pros:** el plomero entra 30 s al día, aprueba y se va; transmite "el agente trabaja solo" (Sidekick Pulse, Linear).
- **Contras:** la conversación queda menos visible; corregir un video requiere ir a otra vista; riesgo de parecer otro dashboard de notificaciones.
- **Móvil:** excelente (como WhatsApp/notificaciones); tarjetas con botón grande Aprobar.
- **Páginas:** Inicio → feed; aprobaciones → sección fija arriba del feed; resto igual.

### C) Híbrido "Hoy" (RECOMENDADA)
Home "Hoy" = **feed del agente** (Necesita tu OK / Lo que hice / Próximo / Resultados) con **compositor grande siempre visible abajo** (⌘J, voz, chips). Al escribir o tocar "Cambiar…", la conversación se abre como panel/columna junto a la tarjeta (en móvil, hoja inferior a pantalla completa), y la tarjeta se actualiza a v2 en el sitio. Mockup: `opcion-c-hibrido-hoy.html`.
- **Pros:** combina lo mejor: estado de un vistazo (B) + conversación como forma principal de actuar (A); el chat deja de ser "ayuda" porque el compositor es el elemento más prominente de la pantalla y cada tarjeta lleva a él; aprobaciones en lote; el agente narra en primera persona ("Tu agente trabajó mientras dormías").
- **Contras:** más complejo de construir (estado compartido feed ↔ conversación); hay que cuidar que no se vea saturado.
- **Móvil:** feed vertical con tarjetas grandes, compositor + micrófono fijo sobre la tab bar (Hoy · Campaña · Videos · Negocio); "Cambiar" abre hoja de chat; notificaciones push → directo a la tarjeta.
- **Cómo encajan las páginas:**
  - *Inicio* → "Hoy" (feed + compositor).
  - *Aprobaciones* → sección "Necesita tu OK" arriba de Hoy + badge en la nav; tarjetas MCP-UI con 2 acciones.
  - *Mi campaña / calendario* → se mantiene como vista de detalle, con tira de semana en Hoy; el compositor es contextual ("mueve el del sábado al domingo").
  - *Mis videos* → galería/archivo con versiones; cada video tiene "Cambiar con el agente".
  - *Mi negocio* → la memoria del agente ("lo que sé de tu negocio"), editable por chat.
  - *Avanzado* → se queda escondido abajo en la nav.

## 3. Recomendación
**Opción C.** Pasos concretos:
1. Quitar el botón flotante de chat; poner el compositor fijo en el layout del dueño (todas las páginas), con ⌘J enfocándolo y micrófono.
2. Renombrar Inicio → **Hoy** y reconstruirlo como feed de eventos del orquestador (acciones hechas, pendientes, próximas) en vez de KPIs.
3. Unificar las tarjetas aprobar/cambiar: un solo componente usado en el feed, en el chat y en Mis videos (máx. 2 acciones, preview incrustado, versión).
4. "Cambiar…" abre la conversación anclada a esa tarjeta (panel derecho en desktop, bottom sheet en móvil).
5. Aprobación por lotes + deshacer; niveles de riesgo (publicar vs. responder comentarios).
6. Chips sugeridos contextuales y un timeline "lo que hice" para generar confianza.

## Fuentes
- https://www.aydesign.ai/blog/best-ai-agent-ui-examples-2026
- https://builtux.com/designing-agentic-ai-workspaces-canvas-interfaces-diff-inspectors-2026/
- https://www.setproduct.com/blog/ai-agent-ui-design-patterns
- https://www.affectui.com/guides/approval-ui-ai-agents
- https://uipolish.com/docs/approvals-inbox
- https://help.shopify.com/en/manual/ai-powered-tools/sidekick/pulse
- https://shopify.engineering/mcp-ui-breaking-the-text-wall
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- https://zandigital.in/mcp-apps-saas-front-end
- https://community.hubspot.com/t/may-2026-product-updates/150000/1

---
# Parte 2 (4 nov 2026): A vs C a fondo, y A2UI

## 4. Evidencia: chat-first vs feed/dashboard + chat para dueños de PyME no técnicos
**Estudios y hallazgos de usabilidad**
- **Maia (asistente IA para micro y pequeños negocios en LatAm, en español):** con una caja vacía tipo “Cuéntame tu problema”, muchos usuarios abandonaban el onboarding (*blank-page syndrome*). Probaron dar casos de uso concretos a la semana, y luego a las 23 h: *aun así fue demasiado tarde*. Lo que funcionó fue **empezar con casos específicos y abrir la amplitud con el tiempo**. Este es el dato más cercano a nuestro plomero.
- **Estudio controlado N=24 (ACM, chatbot vs dashboard):** sin diferencia significativa en SUS ni en precisión, pero el chatbot dio **más carga mental y temporal y más tiempo por tarea**. El chat se valoró por simple y flexible; el dashboard, por precisión y claridad.
- **arXiv 2605.31287 (N=134, mayo 2026):** la interfaz conversacional redujo la carga mental y fue más rápida en tareas simples, pero **la ventaja desaparece cuando la tarea es más compleja**, y no se prefirió como única base para decidir. Las decisiones complejas siguen necesitando **vistas visuales persistentes**.
- **Artículos de práctica** (creativeriz, Tony Vantur): mencionan el congelamiento ante la página en blanco, que pedir lo mismo cada día es lento por chat y que el historial del chat “se pierde”. Su solución es híbrida: chips sugeridos y UI visible desde el inicio, con el chat como atajo.

**Cómo lo resuelven las plataformas para PyMEs**
| Producto | Patrón | Lección |
|---|---|---|
| Shopify Sidekick + **Pulse** | Tarjetas proactivas (máx. 5) en el **Home** del admin; al tocar una, se abre una conversación con un to-do; nada cambia sin aprobación | Es literalmente la opción C: feed → chat |
| HubSpot Breeze (may-2026) | Chat + **canvas** al lado, una **pregunta aclaratoria como tarjeta**, resúmenes proactivos en móvil | Pregunta en tarjeta en vez de formulario; canvas con versiones |
| Intercom Fin (SMB) | El agente resuelve solo (52 % el 1.er mes, 76 % después); el dueño **revisa** las conversaciones en una bandeja | La propuesta de valor es “el agente trabaja y tú supervisas”, no “chatea” |
| Wix (Aria / AI builder) | El onboarding conversacional genera el sitio y luego **entrega a un editor visual**; Aria es proactiva desde el dashboard | El chat sirve para arrancar y la vista estructurada para mantener |
| Squarespace Blueprint, GoDaddy Airo | Configuración **guiada** con pocas opciones, después el dashboard o editor | Opciones guiadas antes que la caja libre |
| Canva AI | Barra de prompt (texto o **voz**) en el **Home** y botón en el editor, que abre un espacio conversacional | El prompt protagonista arriba del contenido, no un chat escondido |
| Meta Business Agent (WhatsApp) | Se activa desde Herramientas; el agente responde y **avisa cuando necesitas intervenir**; el dueño puede tomar el control. Más de 1 M de negocios | El dueño de PyME ya vive en “el agente actúa y me avisa” |

**Conclusión de la evidencia:** ninguna plataforma grande para PyMEs usa el chat vacío como home para el uso recurrente. El chat-first domina en el **onboarding** (Wix, Airo, Blueprint). El **uso diario** lo dominan las tarjetas proactivas con el chat a un toque (Pulse, Fin, Meta, Breeze).

## 5. Recomendación decisiva: **C, con el chat como protagonista, y A a un toque**
**Por qué:** el plomero vuelve 1 o 2 veces al día desde el celular para *aprobar y ver resultados*, y eso pide feed. Cuando quiere *crear o cambiar*, eso pide chat. La opción A sola cae en la página en blanco y en el historial que se pierde. C sola corre el riesgo de parecer otro dashboard si el chat se achica. La solución es que el compositor sea el elemento más grande y que exista una vista de conversación completa.

**Ruta por fases**
1. **Fase 0, onboarding = A (2 a 3 semanas):** el primer uso es conversacional a pantalla completa. Formulario → el agente presenta el plan → aprueba los primeros 3 reels en el hilo. No se muestra el feed vacío.
2. **Fase 1, Home “Hoy” = C:** quitar el botón flotante. Compositor hero fijo (⌘J, micrófono, 3 chips contextuales) y feed con Necesita tu OK / Lo que hice / Próximo / Resultados. “Cambiar…” abre la conversación anclada a la tarjeta (panel en desktop, hoja inferior en móvil).
3. **Fase 2, A a un toque:** un botón “Conversación” (o deslizar hacia arriba el compositor en móvil) abre el hilo completo a pantalla completa con el lienzo. Se recuerda la preferencia: si un usuario usa sobre todo el chat, su home puede pasar a A (A/B por cohorte).
4. **Fase 3, proactividad fuera de la app:** push o WhatsApp con la tarjeta (“3 reels listos, ¿aprobar?”), como Meta y Pulse, para que el feed se consuma sin abrir la app.

**Qué medir (A/B: A como home vs C)**
- **Activación:** % que aprueba su primer contenido en ≤24 h; tiempo hasta la primera publicación.
- **Página en blanco:** % de sesiones del home sin ninguna acción; % de primeros mensajes que vienen de un chip vs escritos.
- **Retorno:** retención D7/D30, sesiones por semana, % de pendientes aprobados en <24 h (latencia de aprobación).
- **Agencia:** mensajes al agente por usuario por semana (C no debe bajar esto frente a A), % de “Cambiar” resueltos sin salir de la tarjeta.
- **Móvil:** % de aprobaciones desde móvil, uso del micrófono.
- **Cualitativo:** 5 a 8 pruebas con plomeros, electricistas o estéticas: “¿qué tienes pendiente?” y “cambia el reel del jueves”, midiendo tiempo y errores.
- **Regla de decisión:** si A iguala a C en D30 y latencia de aprobación, y además genera más mensajes, se pasa a A. Si no, C se queda.

## 6. A2UI: ¿vale la pena integrarlo?
**Qué es:** el protocolo abierto de Google (Apache 2.0, con contribuciones de CopilotKit) en el que el agente envía **JSON declarativo** (surfaces, componentes de un **catálogo**, data binding, acciones). El cliente lo renderiza con **sus propios componentes nativos**, sin ejecutar código.
**Madurez:** v0.8 legacy → v0.9 (abril 2026, “prompt-first”, catálogos propios, web-core compartido, renderer oficial de React) → **v0.9.1 actual**, con **v1.0 como release candidate** (agrega RPC cliente→servidor y action IDs). El README sigue diciendo *“Early stage public preview… Expect changes”*. El SDK de agente en TypeScript (`@a2ui/agent`) **aún no está publicado**.
**React:** `@a2ui/react` + `@a2ui/web_core` (`A2uiSurface`, `MessageProcessor`, catálogos con Zod), marcado como Stable para v0.8, v0.9.1 y v1.0. SwiftUI, Flutter y Compose están en alpha.

**Comparación**
| | A2UI | MCP-UI / MCP Apps | AG-UI (CopilotKit) | AI SDK tool parts → shadcn (hoy) |
|---|---|---|---|---|
| Qué es | Formato declarativo de UI | HTML del servidor en iframe sandbox (`ui://`) | Transporte y eventos agente↔frontend | Tool calls tipadas que renderizamos con nuestros componentes |
| Estilo | El host (nuestro shadcn) vía catálogo | Lo controla el servidor remoto | El que definamos | 100 % nuestro |
| Ideal para | Agentes **de terceros o remotos**, multiplataforma nativa, UIs compuestas libremente por el LLM | Mostrar nuestra app **dentro de ChatGPT/Claude** | Conectar runtimes de agentes externos (LangGraph, etc.) | **Un solo agente propio** en Next.js |
| Costo para nosotros | Nueva dependencia preview, adaptador AI SDK↔A2UI, mapear el catálogo | Iframes, otra identidad visual | Reemplaza parte de lo que AI SDK ya hace | Ya funciona |

**Respuesta: NO por ahora → “más adelante”.**
- Con **un solo agente propio** en Next.js + `ai@7`, las tool parts tipadas que renderizamos como tarjetas shadcn ya nos dan lo que A2UI promete (UI nativa con nuestro diseño, sin ejecutar código), con mejor tipado, menos dependencias y sin protocolo en preview.
- Nuestras tarjetas son un conjunto **acotado y conocido** (reel, post, calendario, aprobación, pregunta). No necesitamos que el LLM *componga* layouts arbitrarios, y para una persona no técnica conviene la consistencia.
- A2UI está en v0.9.1 con v1.0 en RC y aviso de “expect changes”. El SDK TS de agente no existe todavía.

**Cómo prepararnos sin integrarlo:** definir nuestras tarjetas como un **catálogo** con esquemas Zod (tipo, props, acciones `approve`/`change`) y un único `<AgentCard>` que las renderiza en el feed, el chat y Mis videos. Eso es exactamente el modelo mental de A2UI, así que migrar o exponer un adaptador después sería barato.

**Qué cambiaría la respuesta (a “sí”):**
1. Una **app nativa** (iOS/Android) que deba renderizar las mismas tarjetas del agente → el valor multiplataforma de A2UI se vuelve real.
2. Agentes **de terceros o remotos** (A2A) que muestren UI dentro de Neuralitica, o un marketplace de agentes.
3. Querer que el agente **componga UIs nuevas** al vuelo (reportes a medida) más allá del catálogo fijo.
4. A2UI v1.0 estable más soporte oficial o adaptador en el AI SDK de Vercel.
Para **distribución dentro de ChatGPT/Claude**, el camino sería **MCP Apps**, no A2UI.

## Fuentes de la parte 2
- https://mypeasesoria.org/blog/designing-better-first-interactions/ (Maia)
- https://doi.org/10.1145/3831423.3831460
- https://arxiv.org/abs/2605.31287
- https://creativeriz.com/conversational-ui-vs-dashboards-choosing-the-right-ai-interface/
- https://medium.tonyvantur.com/ux-in-the-age-of-ai-hybrid-patterns-for-chat-and-traditional-ui-c60b5586fbe8
- https://help.shopify.com/en/manual/ai-powered-tools/sidekick/pulse
- https://community.hubspot.com/t/may-2026-product-updates/150000/1
- https://www.intercom.com/small-business
- https://www.websitebuilderexpert.com/website-builders/best-ai-website-builders/
- https://www.squarespace.com/blog/best-ai-website-builder
- https://www.business.com/categories/ai-website-builder/
- https://www.canva.com/canva-ai/
- https://whatsappbusiness.com/products/business-app-ai-agent/
- https://whatsappbusiness.com/blog/introducing-meta-business-agent-ai/
- https://about.fb.com/news/2026/05/introducing-business-ai-on-whatsapp-for-small-businesses-in-india/
- https://a2ui.org/ · https://a2ui.org/reference/renderers/ · https://a2ui.org/introduction/agent-ui-ecosystem/
- https://raw.githubusercontent.com/a2ui-project/a2ui/main/README.md
- https://github.com/a2ui-project/a2ui/blob/main/renderers/react/README.md
- https://developers.googleblog.com/a2ui-v0-9-generative-ui/
- https://www.copilotkit.ai/ag-ui-and-a2ui · https://github.com/copilotkit/generative-ui
- https://galust.ai/guides/mcp-apps-vs-a2ui-vs-ag-ui
