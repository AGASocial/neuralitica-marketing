# neuralitica-marketing — Contexto / Canon

Sistema agéntico de marketing Instagram video-first para prestadores de servicios locales. Términos canónicos del dominio (sin implementación).

## Lenguaje

**Cliente**:
Prestador de servicios locales que usa el producto para obtener contenido de Instagram sin grabarse. Es quien responde la entrevista y aprueba piezas.
_Evitar_: prestador (como rol de producto), dueño, usuario final

**Operator**:
Persona interna de supervisión y excepciones: fallos de jobs, overrides QA permitidos, intervención tras agotar revisión, disparo manual opcional del ciclo. No ejecuta el ciclo semanal normal.
_Evitar_: admin, administrador, staff (salvo que se canonice después)

**Ciclo semanal automatizado**:
Ejecución periódica (scheduler/cron) por Cliente activo que produce Estrategia semanal y generación de video hasta la cola de Aprobación, sin intervención del Operator.
_Evitar_: batch job (como nombre de negocio), cron (en UI de producto)

**Entrevista inicial**:
Proceso guiado con el que el Cliente aporta datos del negocio (servicios, zona, tono, ofertas, objeciones, estilo, restricciones) al arrancar.
_Evitar_: onboarding interview, cuestionario

**Ficha viva**:
Perfil canónico del negocio que alimenta a todos los agentes; se actualiza con lo aprendido.
_Evitar_: Business Profile (en UI EN puede mostrarse traducido), perfil de negocio

**Modo visual**:
Familia de modalidades de producción: avatar propio autorizado, avatar genérico profesional, o B-roll / sin presencia. En V1 el Cliente define **preferencias** (allowlist); la modalidad **por Reel** la asigna la Estrategia semanal según formato, tema y playbook.
_Evitar_: avatar mode, visual preferences (como nombre de entidad), modo único global

**Preferencias de producción visual**:
Conjunto de modalidades que el Cliente acepta (una o más). No es una elección rígida para toda la cuenta ni para toda la semana.
_Evitar_: visual mode selector (como concepto de negocio), single mode

**Modalidad de producción (por slot)**:
Asignación semanal por Reel — avatar propio, genérico o B-roll — dentro del allowlist del Cliente y alineada al Formato de Reel y tema.
_Evitar_: production mode, slot visual type

**Formato de Reel**:
Estructura de contenido del playbook (ej. tip rápido, antes/después, mito vs realidad, objeción, oferta local): hook, ritmo, duración, CTA tipo.
_Evitar_: reel template, content format (genérico)

**Playbook de formatos**:
Catálogo **evergreen** curado de Formatos de Reel (estructura, hooks, hints de guion/edición, modalidades y rubros). Distinto del snapshot semanal de tendencias.
_Evitar_: viral playbook, template library

**Táctica de tendencia**:
Entrada accionable dentro de un Snapshot de tendencias: explicación humana + reglas estructuradas (`hook_type`, `estructura`, `guion_hints`, `editing_hints`) que Strategy/Script/Assembly aplican por slot cuando corresponde.
_Evitar_: trend tip, viral hack

**Snapshot de tendencias**:
Conjunto semanal (`week_start`) de Tácticas de tendencia priorizadas; V1 cargado manualmente por Operator; después el agente de investigación rellena el mismo schema.
_Evitar_: trend report, weekly trends dump

**Avatar propio autorizado**:
Video con likeness del Cliente, solo con consentimiento explícito vigente.
_Evitar_: own_avatar (salvo enum técnico), likeness mode

**Avatar genérico profesional**:
Avatar de oficio que no debe hacerse pasar por el dueño real del negocio.
_Evitar_: generic_avatar (salvo enum)

**Video sin rostro**:
Pieza sin likeness del Cliente; en producto se presenta como **B-roll / sin presencia** (texto en pantalla, clips de oficio, fotos de trabajo, voz IA).
_Evitar_: faceless (salvo enum técnico)

**Consentimiento de avatar**:
Registro append-only de autorización (y revocación) para usar la imagen del Cliente.
_Evitar_: consent ledger (en glosario de negocio)

**Estrategia semanal**:
Plan de contenido Instagram de la semana (pilares, temas, secuencia / slots de Reels).
_Evitar_: weekly brief (salvo que se unifique)

**Paquete de guion**:
Conjunto hook + cuerpo + CTA + texto en pantalla + voiceover para un Reel.
_Evitar_: script package

**Job de generación**:
Trabajo que solicita y rastrea producción de media en un provider externo o pipeline.
_Evitar_: generation job

**Reel ensamblado**:
Pieza 9:16 lista (o casi) tras ensamblar voz, visual, subtítulos, logo y cover.
_Evitar_: assembled reel, media asset (si se separa asset crudo vs pieza final — pendiente zanjar)

**Veredicto QA**:
Resultado de revisión automática de tono, claims, derechos, disclosure y claridad, con bloqueos posibles.
_Evitar_: QA verdict

**Aprobación**:
Decisión del Cliente sobre una pieza (aprobar, pedir cambios, rechazar) antes de publicar.
_Evitar_: approval decision

**Política de costo**:
Reglas server-side de presupuesto máximo y tier de provider antes de generar.
_Evitar_: cost policy (EN UI ok), max_cost como concepto de negocio suelto

**Publicación en Instagram**:
Acción del System que publica un Reel aprobado en la cuenta Instagram Business del Cliente vía API (Graph), ya sea inmediata (botón) o programada. Requiere Aprobación previa.
_Evitar_: Publicación manual asistida (como único modo V1), auto-publish sin Aprobación

**Métricas lite**:
Registro básico de rendimiento (views, likes, comments, saves, DMs) para aprendizaje del siguiente ciclo.
_Evitar_: analytics avanzados
