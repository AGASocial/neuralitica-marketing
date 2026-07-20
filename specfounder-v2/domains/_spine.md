# Espina universal de SpecFounder v2

> El método SDD de SpecFounder es **agnóstico de dominio**: sirve para generar código (sistema, app, API, web) y también estructuras creativas (novela, serie de imágenes, guion, y "infinitas posibilidades"). Lo que cambia entre dominios **no es el motor** (grill-me, igualdad semántica, glosario/canon, checkpoint, recomendar-y-confirmar, Generador de Visión), sino **cómo se nombran las 6 secciones, qué es el glosario y cómo se emite el resultado**.
>
> Este archivo define la **espina universal**: 6 ranuras (slots) que cada perfil de dominio renombra. Los perfiles concretos viven junto a este archivo (`software.md`, `novela.md`, `serie-imagenes.md`, `guion-video.md`) y `_custom.md` explica cómo derivar uno nuevo para cualquier propósito.

---

## Las 6 ranuras universales

| # | Ranura universal | Pregunta esencial | Qué captura |
|---|---|---|---|
| 1 | **Visión / Norte** | ¿Hacia dónde apunta esto y por qué existe? | El "Norte" del proyecto (lo produce el Generador de Visión, ≤ 2 párrafos). |
| 2 | **Actores** | ¿Quién o qué participa? | Las entidades protagonistas (usuarios ↔ personajes/sujetos). |
| 3 | **Elementos** | ¿Qué hace o qué contiene? | Las unidades de valor (funcionalidades ↔ tramas/rasgos/beats). |
| 4 | **Estructura / Flujo** | ¿En qué orden se recorre o se ordena? | La secuencia (flujos de usuario ↔ estructura narrativa/fraccionamiento). |
| 5 | **Forma / Construcción** | ¿Sobre qué base se construye? | El sustrato (arquitectura ↔ mundo/escenarios/guía de estilo). |
| 6 | **Restricciones** | ¿Qué límites invisibles aplican? | Lo no-negociable (requisitos no funcionales ↔ tono, extensión, formato). |

## Artefactos paralelos (universales en todos los dominios)

- **Canon / Glosario** (`CONTEXT.draft.md`): un concepto = un término. En software es el vocabulario del dominio; en obras creativas es la **"biblia"** (nombres de personajes, lugares, reglas del mundo, definición exacta de cada rasgo). Su propósito —igualdad semántica— es idéntico: que el usuario y la IA usen las mismas palabras con el mismo significado, sin redefinirlas en cada momento.
- **Decisiones irreversibles** (`adr/`): decisiones difíciles de revertir, sorprendentes y con trade-off real. En software son ADRs; en obras creativas son **reglas de continuidad/canon** (p. ej. "la magia tiene un costo físico" o "el protagonista nunca miente"): cambiarlas obliga a reescribir mucho.

## Cómo lo usa el agente

1. El Coordinator pregunta el **dominio** al inicio (ver `core/coordinator.md` → `<dominio>`).
2. Carga el perfil correspondiente, que **renombra las 6 ranuras** y ajusta las preguntas guía.
3. El Entrevistador formula las preguntas del perfil (no las genéricas) manteniendo grill-me.
4. El Emisor produce la salida según el dominio: código → metodologías (`openspec`/`github-spec-kit`/`generic-sdd`); creativo → **Biblia** (`methodologies/creative-bible.md`).

La numeración de ranuras (1–6) y las claves `s1..s6` de `session.md` se conservan en todos los dominios; solo cambia su **etiqueta** según el perfil.
