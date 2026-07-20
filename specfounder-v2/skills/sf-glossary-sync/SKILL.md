---
name: sf-glossary-sync
description: Reconcilia el glosario CONTEXT con el resto del spec. Úsala cuando un término aparezca con dos significados, o periódicamente para detectar términos del SPEC que no estén canonizados en CONTEXT.
---

# sf-glossary-sync — Mantener la igualdad semántica

Garantiza que `CONTEXT.draft.md` y `SPEC.draft.md` hablan el mismo idioma. Implementa las reglas del sub-agente Glosarista (`../../agents/glossarist.md`).

## Cuándo usarla
- Cuando un término definido aparece usado con otro significado (contradicción → bloquea el avance).
- Al cerrar cada sección, como barrido rápido de consistencia.
- Antes de la emisión (el adaptador no debe introducir sinónimos de la lista _Evitar_).

## Pasos
1. **Extrae** los términos de dominio usados en `SPEC.draft.md`.
2. **Compara** con `CONTEXT.draft.md`:
   - Término usado pero no definido → propón definición canónica y captúralo.
   - Término definido pero usado con otro sentido → **detente**, plantea la contradicción al usuario, resuélvela, y regístrala en el journal (línea `CANON`).
   - Sinónimo de la lista _Evitar_ usado en el SPEC → reemplázalo por el término canónico.
3. **Verifica pureza:** CONTEXT no debe contener implementación, decisiones técnicas ni notas de diseño. Si las hay, muévelas a SPEC o a un ADR.
4. **Actualiza** `glossary_terms` en `session.md` vía sf-checkpoint.

## Regla
Un concepto = un término. Ante duda entre dos palabras, elige una y manda la otra a _Evitar_.
