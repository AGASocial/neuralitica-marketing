---
name: sf-checkpoint
description: Persiste el estado de la sesión SpecFounder tras cada respuesta. Úsala SIEMPRE antes de formular la siguiente pregunta, para que la sesión sobreviva a caídas. Append al journal + reescritura del session.md mínimo.
---

# sf-checkpoint — Guardar el avance de la entrevista

Ejecuta el **protocolo de checkpoint** definido en `../../persistence/STATE-SCHEMA.md`. Invócala tras CADA respuesta del usuario y ANTES de formular la siguiente pregunta.

> **Por qué así (ver ../../RENDIMIENTO.md):** el checkpoint es la operación más repetida de la sesión (~1 por turno × decenas de turnos). El diseño lo hace barato **estructuralmente**: añadir una línea al final de `journal.md` es una operación fiable y mínima, y `session.md` es tan pequeño (~25-35 líneas) que reescribirlo entero cuesta menos que "editarlo incrementalmente" (cosa que los modelos hacen mal). Nunca condensas ni reorganizas: el journal solo crece.

## Pasos (en orden)

1. **Journal** — *append* de UNA línea al final de `.specfounder/journal.md`:
   `- <timestamp ISO> · <prefijo> · <resumen en una línea>`
   Prefijos: `SEL` · `MAP` · `S{n}.Q{m} ✅/❌` · `S{n}.LOTE` · `CANON` · `ADR-NNNN` · `EMIT` · `NOTA`. Nunca edites, reordenes ni borres líneas existentes.
2. **Drafts, según el tipo de dato del turno:**
   - `.specfounder/CONTEXT.draft.md` — **inmediato** si apareció o cambió un término (la igualdad semántica no espera).
   - `.specfounder/adr/NNNN-*.md` — **inmediato** si se confirmó una decisión que cumple los 3 criterios.
   - `.specfounder/SPEC.draft.md` — se **consolida al cerrar cada sección** (un volcado por sección). Turno a turno la respuesta ya quedó en el journal; si la sesión cae a mitad de sección, el resume reconstruye desde ahí.
3. **Reescribe `.specfounder/session.md` ENTERO** (es el cursor, pequeño por diseño): `updated_at`, estado de la sección, `current_section`, `current_question_id`, `glossary_terms`/`adr_count` si cambiaron, el bloque **"Siguiente acción"** con la pregunta EXACTA que toca (campo crítico del resume) y las **"Ramas abiertas"** vigentes.
4. **Verifica la regla de oro:** `session.md` + `journal.md` deben responder por sí solos "si todo se cae ahora, ¿qué pregunta toca al volver y qué se decidió hasta aquí?". Si no pueden, corrige antes de seguir.

## Resultado
Un cursor al día, un journal que solo creció una línea, y drafts consistentes. Solo después de esto se formula la siguiente pregunta.

> **Excepción — sin acceso a archivos (chat puro):** reimprime el cursor como bloque de texto tras cada turno y el journal acumulado cada ~5 turnos; pide al usuario que los guarde.
