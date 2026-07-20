---
name: sf-explore
description: "Alias de compatibilidad: la exploración de proyectos existentes ahora la orquesta sf-map (inventario + exploradores paralelos + SYSTEM-MAP con evidencia). Úsala igual que antes en modo proyecto-existente; delega en sf-map."
---

# sf-explore — (delegada en sf-map)

Desde v2.1, la exploración de proyectos existentes es un **pipeline agéntico** y vive en la skill **`sf-map`** (`../sf-map/SKILL.md`): inventario determinista → exploradores paralelos por dimensión → síntesis en `SYSTEM-MAP.md` con evidencia (`archivo:línea`) → verificación adversarial (`sf-verify`) → confirmación por lotes en la entrevista.

**Esta skill se conserva como alias de compatibilidad**: si se invoca `sf-explore`, ejecuta `sf-map` completo.

Diferencias clave frente a la exploración de v2.0 (por si retomas una sesión antigua):
- Los hallazgos ya no van directo a `SPEC.draft.md`: van al `SYSTEM-MAP.md` con evidencia, y entran al spec solo tras la confirmación por lotes del usuario.
- Las etiquetas `[confirmado-por-código]` / `[inferido]` / `[ausente]` se mantienen (ahora `[confirmado]` exige evidencia `archivo:línea`).
- El protocolo de prioridades de lectura (docs → config → dominio → comportamiento → frontend → tests) sigue vigente: es el reparto de dimensiones de los exploradores.
