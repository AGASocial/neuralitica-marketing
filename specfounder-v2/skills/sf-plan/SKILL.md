---
name: sf-plan
description: Puente del spec al plan de trabajo. Según la metodología, prepara y encadena el paso de planificación nativo del destino (Spec-Kit /speckit.plan, OpenSpec /opsx:propose) o deriva PLAN.md + TASKS.md desde el spec en SDD genérico/creativo. Úsala tras la emisión (sf-emit), cuando el usuario quiera pasar del qué al cómo.
---

# sf-plan — Del spec al plan, sin duplicar la herramienta destino

SpecFounder produce el **qué** (la fundación del spec). Esta skill cierra el ciclo hacia el **cómo**, con una regla: **si el destino tiene su propio paso de planificación, no lo dupliques — prepáralo y lánzalo**. Solo en destinos sin herramienta (SDD genérico, Biblia) el plan lo deriva SpecFounder.

## Según la metodología (leer de `session.md`)

**github-spec-kit** — Spec-Kit ya tiene `/speckit.plan` y `/speckit.tasks`:
1. Verifica que la emisión pasó sf-validate (constitution + spec.md conformes).
2. Indica al usuario el encadenamiento exacto: ejecutar `/speckit.plan` sobre el spec del módulo P1 primero (opcionalmente `/speckit.clarify` antes si quedara ambigüedad, y `/speckit.analyze` después para consistencia spec↔plan↔tasks).
3. Aporta como contexto del plan: los ADRs (restricciones duras) y la Sección 5 (que el spec.md deliberadamente no contiene).

**openspec** — OpenSpec planifica por cambio con `/opsx:propose`:
1. Deriva de las prioridades la **cola de cambios sugerida**: un change por módulo P1 (luego P2), cada uno con su alcance en una frase.
2. Indica al usuario: `/opsx:propose <primer-cambio>` — la CLI generará proposal/specs/design/tasks; los specs base emitidos por SpecFounder son la "truth" sobre la que se proponen deltas.
3. Recuerda que design.md de cada change debe respetar los ADRs.

**generic-sdd / creative-bible** — no hay herramienta: SpecFounder deriva el plan:
1. Genera `PLAN.md`: fases ordenadas por prioridad (P1 → P2 → P3), cada fase con sus módulos/flujos, sus dependencias y los ADRs que la restringen. En creativo: orden de producción de piezas (capítulos/imágenes/partes) sobre el marco de la Biblia.
2. Genera `TASKS.md`: checklist por fase — tareas concretas y verificables derivadas de funcionalidades (S3) y flujos (S4), cada una trazable a su sección del SPEC ("cubre S3.Módulo-X / Flujo-Y"). Sin estimaciones inventadas.
3. Regla de trazabilidad: toda tarea apunta a algo del SPEC; si una tarea no traza, o falta en el spec (→ re-spec) o sobra en el plan.

## Reglas
- Nunca planifiques sobre un spec que no pasó sf-validate.
- El plan hereda el vocabulario del glosario (cero sinónimos de _Evitar_).
- Los criterios de éxito (S1) se copian al plan como criterios de "hecho" del conjunto.
- Registra en el journal (línea NOTA) qué se planificó o qué comando se dejó indicado.
