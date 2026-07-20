---
name: sf-drift
description: Detecta drift entre el spec emitido y el código actual. Usa git diff desde la última emisión para re-explorar solo lo tocado y propone actualizaciones puntuales al spec. Úsala periódicamente o antes de una nueva feature, para que el spec siga siendo un contrato vivo.
---

# sf-drift — Re-spec dirigido, no re-spec completo

"El spec es un contrato vivo: cuando el producto cambie, actualiza el spec primero" es fácil de decir y caro de hacer si implica re-mapear todo. Esta skill lo hace barato: **diff dirigido** desde la última emisión.

## Precondición
Existe una emisión previa registrada en el journal (línea `EMIT`, con fecha y rutas). Si no la hay, esto es un `re-spec-parcial` normal → usa `sf-map`.

## Pasos

1. **Ancla temporal:** localiza en `journal.md` la última línea `EMIT` (o la última pasada de sf-drift, línea `NOTA drift`). Si el repo tiene git, identifica el commit más cercano a esa fecha (`git log --until=<fecha>`).
2. **Diff barato (determinista):** `git diff --stat <ancla>..HEAD` → lista de archivos tocados. Sin git: compara fechas de modificación contra el ancla.
3. **Mapear cambios a secciones:** cruza los archivos tocados con la evidencia del `SYSTEM-MAP.md` (cada afirmación cita `archivo:línea`). Un archivo tocado invalida potencialmente las afirmaciones que lo citan → esas secciones son **sospechosas**. Archivos nuevos sin afirmación asociada → posible funcionalidad no especificada (Sección 3).
4. **Re-exploración dirigida:** lanza exploradores (`sf-map` fase 1) SOLO sobre los archivos tocados de las secciones sospechosas. Compara sus afirmaciones nuevas contra el spec emitido.
5. **Informe de drift:**
   - **Spec roto:** el código contradice el spec → proponer corrección (¿cambió el producto o es un bug?).
   - **Spec incompleto:** hay comportamiento nuevo sin especificar → mini-entrevista solo de eso (grill-me, ids `S{n}.Qa{m}`).
   - **Spec intacto:** los cambios no afectan afirmaciones (refactors, estilos) → solo se registra.
6. **Aplicar:** con confirmación del usuario, actualiza drafts y re-emite SOLO los artefactos afectados (sf-emit parcial + sf-validate). Actualiza el SYSTEM-MAP (afirmaciones y evidencia) y registra `NOTA drift` en el journal con el nuevo ancla.

## Reglas
- Nunca actualices el spec sin confirmación del usuario: el drift puede ser un bug del código, no una decisión de producto.
- Si el diff toca > ~40% del código mapeado, el dirigido deja de ser barato: recomienda re-spec-parcial con sf-map completo.
- En dominios creativos: el "diff" son piezas nuevas (capítulos/imágenes) — compara contra CANON.md y reporta violaciones de continuidad.
