---
name: sf-resume
description: Recupera una sesión SpecFounder interrumpida. Úsala al activar el agente para detectar .specfounder/session.md, mostrar un resumen de lo realizado y retomar exactamente donde quedó, sin repetir preguntas.
---

# sf-resume — Retomar una sesión interrumpida

Ejecuta el **protocolo de resume** de `../../persistence/STATE-SCHEMA.md`.

## Pasos

1. **Detecta** si existe `.specfounder/session.md` en la raíz del proyecto.
   - **No existe** → no hay nada que retomar: arranca sesión nueva (fase de selección del coordinator).
   - **Existe** → continúa.
2. **Carga** `session.md` completo + las **últimas ~15 líneas** de `journal.md` (no todo el journal: puede ser largo) + `CONTEXT.draft.md`. Carga `SPEC.draft.md` y `SYSTEM-MAP.md` solo si la fase actual los necesita (p. ej. mitad de entrevista brownfield).
3. **Muestra el resumen de retomada** (sin re-preguntar nada):

```
🔄 Sesión recuperada — "<project_name>" (<domain> · <methodology> · <project_mode>)

Progreso:
  ✅ / ⏳ / ⬜ por cada sección (s1..s6, con la etiqueta del perfil)
Glosario: <glossary_terms> términos · ADRs: <adr_count>

Última decisión: <última línea de decisión del journal>
Ramas abiertas: <lista de session.md o "ninguna">

▶️ Retomo aquí: <Siguiente acción>
   ¿Continuamos?
```

4. **Al confirmar**, formula exactamente la pregunta de **Siguiente acción**. No repitas ninguna pregunta cuyo id ya aparezca en el journal.
5. Si la sesión cayó a MITAD de una sección (SPEC.draft.md aún no consolida esa sección), reconstruye lo respondido desde las líneas del journal de esa sección antes de continuar.

## Migración de sesiones v2.0 (sin journal.md)
Si `session.md` existe pero NO hay `journal.md` (sesión iniciada con v2.0): crea `journal.md` y vuelca en él, como líneas de journal, el "Log de decisiones", las "Contradicciones resueltas" y las "Notas de retomada" del `session.md` antiguo; después reescribe `session.md` al formato mínimo v2.1 (cursor + ramas abiertas). Hazlo como parte del primer checkpoint tras retomar.

## Nota para entornos sin acceso a archivos
Si la sesión corrió en modo "chat puro", el usuario debió guardar los bloques de cursor y journal. Pídele que los pegue y reconstruye el estado a partir de ellos.
