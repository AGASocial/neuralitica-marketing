---
name: sf-emit
description: Emite los artefactos finales del spec en la metodología elegida (OpenSpec, GitHub Spec-Kit, SDD genérico o Biblia creativa) con el formato literal del destino, los valida y genera el handoff. Úsala al cierre, tras la pasada de sf-verify.
---

# sf-emit — Compilar el spec a la metodología destino

Implementa el sub-agente Adaptador (`../../agents/emitter.md`) aplicando el mapeo de `../../methodologies/` — que se carga **recién ahora** (carga perezosa). Si el entorno soporta sub-agentes, delega la emisión en uno (trabajo batch, ideal para un modelo económico); si no, ejecútala en el hilo.

## Precondiciones (no emitir si fallan)
- Las 6 secciones en estado `completa` (salvo modo glosario-urgente).
- Sin ramas abiertas ni contradicciones sin resolver en `session.md`.
- La pasada de `sf-verify` (modo spec completo) ejecutada y sin hallazgos bloqueantes.

Si algo falta, devuelve el control e indica qué resolver.

## Pasos
1. Lee `domain` y `methodology` de `.specfounder/session.md`.
2. Carga SOLO el adaptador correspondiente:
   - `generic-sdd` → `SPEC.md` + `CONTEXT.md` + `docs/adr/`.
   - `openspec` → `openspec/project.md` + `openspec/specs/<capability>/spec.md` por módulo, en formato Requirement/Scenario con SHALL (ver `../../methodologies/openspec.md`).
   - `github-spec-kit` → constitution + `specs/NNN-<modulo>/spec.md` con user stories P1-P3, FR-IDs, SC-IDs, Given/When/Then (ver `../../methodologies/github-spec-kit.md`).
   - `creative-bible` → `BIBLE.md` + `CANON.md`.
3. Genera los archivos destino en la estructura real del proyecto (fuera de `.specfounder/`), usando las **prioridades P1/P2/P3** de la Sección 3 para el orden y el scoping.
4. Respeta los términos canónicos de CONTEXT; nunca introduzcas sinónimos de _Evitar_.
5. **Valida** con `sf-validate` (nivel 2): checklist del formato destino + validador de la herramienta si existe (`openspec validate --strict`). Corrige hasta que pase.
6. Produce el bloque de handoff de la metodología, con el **siguiente paso concreto** (Spec-Kit: `/speckit.plan` · OpenSpec: `/opsx:propose` · genérico/creativo: ofrecer `sf-plan`).
7. Actualiza `session.md` → `phase: emitido` y registra la línea `EMIT` (con rutas) en el journal (vía sf-checkpoint).
