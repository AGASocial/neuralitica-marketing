# Salida — Biblia creativa (Markdown)

> **Para:** dominios creativos (`novela`, `serie-imagenes`, `guion-video`, `custom` no-software).
> **No es una herramienta SDD de código** como OpenSpec o Spec-Kit: es un formato de salida portable, editable a mano y listo para alimentar cualquier IA o equipo creativo.
> Es el equivalente creativo de `generic-sdd.md`.

---

## Qué produce

Una **Biblia** (story bible / series bible / guion-marco) en Markdown que consolida el SPEC neutral y el canon en un único documento reutilizable, más el canon como archivo aparte.

| Origen (`.specfounder/`) | Destino (raíz del proyecto) |
|---|---|
| `SPEC.draft.md` (6 secciones del perfil) | `BIBLE.md` — la biblia de la obra |
| `CONTEXT.draft.md` | `CANON.md` — registro canónico (personajes, lugares, rasgos, términos) |
| `adr/*.md` | sección "Reglas de continuidad" dentro de `BIBLE.md` (o `docs/canon/` si son muchas) |

> Los nombres `BIBLE.md` / `CANON.md` son la recomendación; puedes usar los que el usuario prefiera (p. ej. `BIBLIA.md`, `STORY-BIBLE.md`).

## Estructura de `BIBLE.md` (orientativa)

```md
# Biblia — <Título de la obra>

## 1. <Visión del perfil>        (Premisa/Tema · Concepto Visual · Logline)
## 2. <Actores del perfil>       (Personajes y Facciones · Sujetos · Personajes y Voces)
## 3. <Elementos del perfil>     (Tramas · Rasgos Recurrentes · Beats)
## 4. <Estructura del perfil>    (Estructura Narrativa · Línea de la Serie · Fraccionamiento)
## 5. <Forma del perfil>         (Mundo y Escenarios · Guía de Estilo · Formato)
## 6. <Restricciones del perfil> (Tono/Estilo · Producción · Restricciones)

## Reglas de continuidad (canon irreversible)
- <decisiones difíciles de revertir>

> Canon detallado (personajes, lugares, términos): ver CANON.md
```

## Reglas de emisión
- Usa los **nombres de sección del perfil de dominio activo** (ver `../domains/<domain>.md`), no las etiquetas universales.
- `CANON.md` es la fuente de verdad del vocabulario: nombres canónicos + variantes a _Evitar_. Nunca uses un sinónimo descartado al redactar la biblia.
- No inventes contenido que el usuario no definió; si falta algo, vuelve al Coordinator.

## Handoff

```
### Handoff — SpecFounder v2 → Biblia creativa

BIBLE.md es la fuente de verdad de la obra; CANON.md fija los nombres y rasgos canónicos.
Úsalos como marco fijo: al generar un capítulo, una imagen o una parte del video,
respeta personajes, mundo, estilo y reglas de continuidad sin redefinirlos.
Los términos de CANON.md son los únicos válidos. Si algo contradice la biblia, señálalo antes de continuar.
```

## Uso posterior
La Biblia se puede pegar como contexto base en cualquier IA generativa (texto o imagen) o repartir al equipo. Cada nueva pieza (capítulo, imagen, segmento) solo añade lo específico, heredando la estructura común.
