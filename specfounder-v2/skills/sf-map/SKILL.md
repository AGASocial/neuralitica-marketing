---
name: sf-map
description: Mapea un sistema existente de forma agéntica antes de entrevistar. Inventaría el repo, lanza exploradores en paralelo por dimensión, sintetiza un SYSTEM-MAP.md con evidencia (archivo:línea) y prepara la confirmación por lotes. Úsala en modo proyecto-existente o re-spec-parcial, antes de la entrevista.
---

# sf-map — Mapeo agéntico de un sistema existente

Es la pieza brownfield central de SpecFounder v2. Sustituye la exploración secuencial por un pipeline: **inventario barato → exploradores paralelos → síntesis con evidencia → verificación → entrevista por lotes**. El material crudo (código, manuscrito) se queda en el contexto de los exploradores; al hilo principal solo vuelve el destilado.

## Fase 0 — Inventario (determinista, casi 0 tokens de modelo)

Con herramientas de shell, sin leer contenido:
1. Estructura: árbol de directorios (2-3 niveles), nº de archivos y LOC por área (`tree`, `wc -l`). Excluye dependencias (`vendor/`, `node_modules/`, builds).
2. Stack: manifiestos (package.json, composer.json, pyproject, go.mod…), lockfiles, Dockerfile.
3. Historia (si hay git): archivos con más cambios recientes (`git log --stat` resumido) → los **hotspots** son lectura prioritaria.
4. Documentación existente: README, docs/, ADRs, specs previos.

Con el inventario, **decide la escala**:

| Tamaño del repo | Estrategia |
|---|---|
| Pequeño (< ~200 archivos fuente) | 2-3 exploradores; lectura completa de cada dimensión. |
| Medio (200–2000) | 4-6 exploradores (uno por dimensión); lectura completa de dominio/datos y muestreo del resto. |
| Grande (> 2000 / monorepo) | 6+ exploradores; **muestreo dirigido**: por dimensión, los archivos más grandes + los hotspots de git. Declarar SIEMPRE lo omitido en "Cobertura y límites". |

## Fase 1 — Fan-out de exploradores (paralelo, contexto aislado)

Lanza un sub-agente **explorador** (`../../agents/explorer.md`) por dimensión, cada uno con su dimensión, el perfil de dominio activo y su presupuesto:

- Dimensiones de código: documentación · configuración/infra · dominio/datos (modelos, migraciones, enums) · comportamiento (rutas, controladores, jobs, eventos, cron) · frontend/roles · tests.
- Dimensiones creativas: manuscrito/capítulos · biblia/canon previo · piezas producidas.
- Fuentes vivas (opcional, si hay acceso): esquema real de la base de datos, listado de endpoints desplegados — valen como evidencia de primera clase.

Cada explorador devuelve **solo** su informe estructurado (afirmaciones etiquetadas + evidencia + términos candidatos + decisiones detectadas). Si el entorno **no soporta sub-agentes** (monolito), ejecuta las dimensiones por etapas en el propio hilo, destilando cada una a afirmaciones antes de pasar a la siguiente.

## Fase 2 — Síntesis → SYSTEM-MAP.md

Consolida los informes en `.specfounder/SYSTEM-MAP.md` (plantilla: `../../persistence/templates/system-map.template.md`):
1. Agrupa las afirmaciones por ranura (1-6) del perfil de dominio; deduplica; ante conflicto entre exploradores, marca contradicción.
2. Toda afirmación `[confirmado]` conserva su evidencia `archivo:línea`. Sin evidencia → degrádala a `[inferido]`.
3. Consolida términos candidatos (los sinónimos detectados son contradicciones latentes para el Glosarista) y decisiones candidatas a ADR.
4. Escribe "Cobertura y límites": qué NO se exploró y por qué. Nunca dejes que un mapa parcial parezca completo.

## Fase 3 — Verificación adversarial (recomendada)

Pasa las afirmaciones `[inferido]` por `sf-verify` (modo inferencias): sub-agentes que intentan REFUTAR cada una contra el material. Resultado por afirmación: verificado ✅ · refutado ❌ (con contraejemplo) · indecidible ⚠️ (→ pregunta de entrevista). Actualiza el mapa.

## Fase 4 — Handoff a la entrevista

1. Registra en el journal la línea `MAP` (nº exploradores, nº afirmaciones por etiqueta) y haz checkpoint (sf-checkpoint).
2. Reporta al usuario un resumen del mapa: qué secciones quedaron precargadas, cuántas afirmaciones por confianza, contradicciones encontradas.
3. La entrevista arranca cada sección con **confirmación por lotes** (`S{n}.LOTE`): un turno que presenta lo confirmado/verificado con su evidencia y pregunta "¿corrijo algo?". El grill-me sigue solo sobre lo `[ausente]`, lo refutado y lo corregido.

## Modo re-spec-parcial

No re-mapees todo: si hay una emisión previa registrada en el journal (línea EMIT) usa `sf-drift`; si no, compara el spec existente contra el material con exploradores dirigidos solo a las secciones sospechosas, y lista las **secciones rotas** — solo esas van a entrevista.

## Reglas

- Solo lectura sobre el material del proyecto.
- El código crudo no entra al hilo principal: viaja explorador → informe → mapa.
- Presupuesto antes que exhaustividad: un mapa honesto con límites declarados vale más que uno "completo" y superficial.
- Checkpoint al terminar cada fase (el mapeo también debe sobrevivir a caídas).
