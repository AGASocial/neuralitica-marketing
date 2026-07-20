---
name: sf-brief
description: Intake de material aportado en proyectos nuevos (modo nuevo-con-material). Recibe el contexto del usuario (docs de APIs, flujos, lógica, resultado esperado), lo normaliza en un SYSTEM-MAP.md con referencias al material, deriva la Visión y siembra la sesión para que la entrevista solo cubra los huecos. Úsala cuando el usuario ya tiene información escrita de lo que quiere construir.
---

# sf-brief — De tu material a la sesión sembrada

Caso típico: un usuario técnico quiere especificar un **microservicio** (o cualquier sistema) y **ya tiene** las APIs que consumirá (URLs, estructuras, respuestas), el flujo de uso, la lógica de cada proceso y el resultado esperado. No hay código que mapear (`sf-map` no aplica) pero entrevistarlo desde cero sería re-preguntarle lo que ya escribió.

`sf-brief` es la puerta de entrada de ese material: lo **normaliza** al mismo artefacto que usa el flujo brownfield (`SYSTEM-MAP.md`), con lo que toda la maquinaria existente —confirmación por lotes, verificación, entrevista de huecos— funciona igual. El resultado NO es código: es el spec neutral de siempre, emitible a cualquier metodología, listo para pedir el desarrollo sobre el documento.

## Paso 1 — Recepción del material

Pide al usuario que entregue TODO lo que tenga, sin ordenarlo (pegado en el chat, o como archivos/carpeta que puedas leer):
- Documentación de las APIs a consumir: URLs base, endpoints, autenticación, estructuras de request/respuesta, límites.
- El flujo de cómo se usan (orden de llamadas, dependencias entre ellas).
- La lógica de cada proceso (reglas, transformaciones, condiciones).
- El resultado esperado: qué debe pasar cuando se llame al servicio.
- Restricciones ya decididas (lenguaje/framework si ya lo eligió, hosting, etc.).

Si el material son **archivos**, puedes delegar la lectura en exploradores de `sf-map` (dimensión: "material aportado"). Si viene **pegado**, normalízalo en el propio hilo.

## Paso 2 — Normalización → SYSTEM-MAP.md

Escribe `.specfounder/SYSTEM-MAP.md` (plantilla `../../persistence/templates/system-map.template.md`), con **evidencia = fuente del material** (`brief §API-Pagos`, `doc-flujo.md`, "mensaje del usuario") en lugar de `archivo:línea`:

- **Afirmaciones por ranura** con las etiquetas de siempre:
  - `[confirmado]` — lo que el material dice explícitamente (endpoints, estructuras, pasos del flujo).
  - `[inferido]` — lo que se deduce del material (p. ej. "el servicio es síncrono porque el flujo espera la respuesta de X"). Pásalo por el sombrero Verificador o márcalo para confirmación.
  - `[ausente]` — lo que el material NO dice. En briefs de microservicio, los ausentes típicos son: error paths por cada API que falla, reintentos/timeouts/idempotencia, manejo de secretos, criterios de éxito medibles, prioridades, SLA propio vs SLA de terceros. Estos son el corazón de la entrevista que sigue.
- **Inventario de APIs consumidas** (bloque propio): por API → nombre · base URL · auth · endpoints usados (método, ruta, request/respuesta resumida) · límites conocidos. Este inventario aterrizará en el SPEC §5.
- **Términos candidatos al glosario**: las entidades de los schemas de las APIs son oro (¿"customer" de la API = tu "cliente"? ¿o son cosas distintas? — igualdad semántica entre tu dominio y el de las APIs de terceros).
- **Decisiones detectadas (candidatas a ADR)**: lo que el usuario ya fijó (lenguaje, elección de esas APIs y no otras, síncrono vs colas) — se confirman los 3 criterios con él.
- **Cobertura y límites**: qué partes del material quedaron ambiguas o sin procesar.

## Paso 3 — Visión derivada (fast-track, un turno)

Del resultado esperado del brief, redacta la Visión (≤ 2 párrafos, normativa de siempre) y preséntala para validación en UN turno: "Del material derivo esta Visión — ¿la confirmas o la ajusto?". Registra `vision_mode: derivada`. (No apliques la ruta CONSTRUIR completa de 3 alternativas: el usuario ya sabe qué quiere; sería ceremonia.)

## Paso 4 — Sesión sembrada

1. Checkpoint: línea `MAP` en el journal (fuente: brief; nº de afirmaciones por etiqueta) y `session.md` apuntando a la primera sección.
2. La entrevista corre como en brownfield: cada sección arranca con **confirmación por lotes** (`S{n}.LOTE`) de lo que el brief ya responde, y el grill-me cubre SOLO los `[ausente]` — que en este caso son justo las preguntas que hacen que el spec valga la pena (resiliencia, NFRs, prioridades, criterios de éxito).
3. Si el dominio es software con APIs consumidas, usa la **extensión de perfil** de `../../domains/software.md` (contrato expuesto, fallos por API, secretos, observabilidad).

## Reglas
- No inventes lo que el material no dice: `[ausente]` se pregunta, no se rellena.
- Las estructuras de las APIs se citan como evidencia pero NO se copian enteras al hilo si son extensas: resume (campos clave) y referencia la fuente.
- El brief original se conserva (si son archivos, no los toques; si fue pegado, guárdalo en `.specfounder/brief/` para trazabilidad).
- Todo lo demás (checkpoint, journal, una pregunta de descubrimiento por turno, glosario puro) aplica sin cambios.
