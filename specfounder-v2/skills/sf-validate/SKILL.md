---
name: sf-validate
description: Valida el spec y los artefactos emitidos - checklist de completitud del spec neutral y validación del formato contra la metodología destino (incluye openspec validate cuando aplica). Úsala antes de dar por terminada la emisión, o en cualquier momento para auditar el estado del spec.
---

# sf-validate — El spec no está listo hasta que valida

Dos niveles de validación: el **spec neutral** (independiente del destino) y los **artefactos emitidos** (formato literal del destino). `sf-emit` no debe dar por emitido nada que no pase ambos.

## Nivel 1 — Checklist del spec neutral

Verifica sobre `.specfounder/` y reporta ✅/❌ por ítem:

- [ ] Las 6 secciones en estado `completa` (salvo modo glosario-urgente).
- [ ] Sin ramas abiertas en `session.md`.
- [ ] Visión ≤ 2 párrafos y responde por qué existe / qué problema / esencia única.
- [ ] Criterios de éxito presentes (≥ 2), medibles y agnósticos de tecnología.
- [ ] "Fuera de alcance" explícito (≥ 1 exclusión).
- [ ] Cada módulo de la Sección 3 tiene prioridad (P1/P2/P3); existe al menos un P1 y no todo es P1.
- [ ] Cada flujo crítico tiene happy path + al menos un error path.
- [ ] Glosario: cada término con definición ("qué ES") y lista _Evitar_; ningún sinónimo de _Evitar_ aparece en SPEC.draft.md.
- [ ] Todo término de dominio usado en el SPEC está definido en CONTEXT (y viceversa: sin términos huérfanos).
- [ ] ADRs: cada uno cumple los 3 criterios (si uno no, degradarlo a nota del SPEC).
- [ ] La pasada de sf-verify (modo spec completo) se ejecutó sin hallazgos bloqueantes.

## Nivel 2 — Validación de los artefactos emitidos (según `methodology`)

**openspec:**
- Si la CLI está instalada: ejecuta `openspec validate --strict` y corrige hasta que pase.
- Si no: verifica a mano el formato literal — cada spec con `## Purpose` + `## Requirements`, requisitos como `### Requirement: <nombre>` con redacción **SHALL**, cada requisito con ≥ 1 `#### Scenario:` en Given/When/Then.

**github-spec-kit:**
- `spec.md` sin menciones de stack/tecnología (grep de nombres de frameworks/lenguajes → mover a constitution/plan).
- Estructura de plantilla presente: User Stories con prioridad (P1/P2/P3) e "Independent Test", Acceptance Scenarios Given/When/Then, Edge Cases, `FR-NNN` con MUST, Key Entities, `SC-NNN` medibles, Assumptions.
- Sin marcadores `[NEEDS CLARIFICATION]` residuales (SpecFounder no avanza con ramas abiertas; si quedó alguno, es un bug del cierre).

**generic-sdd:**
- SPEC.md/CONTEXT.md/docs/adr/ completos y consistentes con los drafts (misma información, sin pérdidas).

**creative-bible:**
- BIBLE.md con las 6 secciones del perfil; CANON.md cubre todo personaje/lugar/término citado en la biblia; reglas de continuidad presentes.

## Salida

Informe de validación: lista ✅/❌ con la corrección concreta por cada ❌. Registra el resultado en el journal (línea NOTA). Si hay ❌ de nivel 1, se vuelve a entrevista/cierre; si son de nivel 2, se corrige la emisión.
