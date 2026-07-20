---
name: sf-domain
description: Selecciona el dominio/propósito del spec al inicio (software o creativo) y carga el perfil que renombra las 6 secciones. Úsala como primer paso, antes de elegir metodología y modo.
---

# sf-domain — Seleccionar el dominio del spec

Determina para qué es el spec y carga el **perfil de dominio** correspondiente (`../../domains/`). Implementa el paso de dominio del Coordinator. Es el **primer** paso de una sesión nueva.

## Paso 1 — Preguntar el propósito
"¿Para qué es este spec? **Código** (sistema, app, API, web) o **Creativo** (novela/libro, serie de imágenes, guion de video, u otro)."
Luego el subtipo. Perfiles disponibles:
- `software` → ver `../../domains/software.md`
- `novela` → `../../domains/novela.md`
- `serie-imagenes` → `../../domains/serie-imagenes.md`
- `guion-video` → `../../domains/guion-video.md`
- `custom` → `../../domains/_custom.md` (cualquier otro propósito; se deriva el perfil al vuelo)

## Paso 2 — Cargar el perfil
- Renombra las 6 ranuras universales según el perfil (las claves `s1..s6` de `session.md` no cambian; solo su etiqueta).
- Para `custom`, propón el remapeo de secciones y confírmalo con el usuario.

## Paso 3 — Encadenar la salida correcta
- `software` → a continuación se elige metodología (`openspec`/`github-spec-kit`/`generic-sdd`).
- creativo (`novela`/`serie-imagenes`/`guion-video`/`custom` no-software) → fija `methodology: creative-bible` en `session.md` (la salida será **Biblia**, `../../methodologies/creative-bible.md`); **no** se ofrecen OpenSpec/Spec-Kit ni se pregunta metodología.

## Paso 4 — Persistir
Registra `domain` y `methodology` en `session.md` (y el remapeo si es `custom`, como línea `NOTA` en el journal) vía sf-checkpoint. Después continúa con la selección de modo y la fase que toque (Visión si es nuevo; sf-map si es existente).
