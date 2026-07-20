# SYSTEM-MAP — <nombre del proyecto>

> Mapa del sistema existente generado por `sf-map`. Cada afirmación lleva su **evidencia** (`archivo:línea`)
> y su nivel de confianza. Alimenta la entrevista: lo confirmado se valida por lotes, lo ausente se pregunta.
>
> Generado: <fecha> · Inventario: <nº archivos> archivos · <LOC aprox> LOC · stack: <detectado>
> Exploradores: <n> (dimensiones: <lista>) · Verificación adversarial: <sí/no>

## Inventario (fase 0 — determinista)

- **Stack / manifiestos:** <p. ej. Laravel 11 (composer.json), Vue 3 (package.json)>
- **Módulos / directorios principales:** <lista con tamaño relativo>
- **Hotspots de cambio** (git log): <archivos/áreas con más commits recientes>
- **Documentación encontrada:** <README, docs/, ADRs previos, specs previos>

## Afirmaciones por ranura

<!-- Etiquetas de confianza:
     [confirmado]  dato inequívoco extraído del material, con evidencia.
     [inferido]    deducción razonable; si pasó por sf-verify: (verificado ✅) o (refutado ❌).
     [ausente]     el material no lo responde; será pregunta de entrevista. -->

### Ranura 2 — <Actores según el perfil>
- [confirmado] <afirmación> — evidencia: `ruta/archivo.ext:12`, `ruta/otro.ext:80`
- [inferido] (verificado ✅) <afirmación> — evidencia: `ruta:línea` — verificación: <cómo se comprobó>
- [ausente] <qué falta y por qué el código no lo responde>

### Ranura 3 — <Elementos>
- ...

### Ranura 4 — <Estructura/Flujo>
- ...

### Ranura 5 — <Forma/Arquitectura>
- ...

### Ranura 6 — <Restricciones>
- ...

## Términos candidatos al glosario
| Término | Fuente | Evidencia | ¿Sinónimos detectados? |
|---|---|---|---|
| <Entidad> | modelo/tabla | `app/Models/X.php:1` | <"cuenta" en UI, "cliente" en docs> |

## Decisiones detectadas (candidatas a ADR)
<!-- Decisiones YA tomadas en el código que cumplen los 3 criterios (difícil de revertir ·
     sorprendente sin contexto · trade-off real). Se confirman con el usuario antes de registrarlas. -->
- <decisión> — evidencia: `ruta:línea` — por qué parece deliberada: <razón>

## Contradicciones material ↔ documentación
- <qué dice el código vs qué dice la doc> — a resolver en entrevista

## Cobertura y límites de este mapa
<!-- Honestidad sobre lo NO explorado: directorios omitidos, muestreo aplicado, presupuesto agotado. -->
- <p. ej. "vendor/ y node_modules/ excluidos; se muestrearon 15 de 90 controladores (los de mayor tamaño y cambio)">
