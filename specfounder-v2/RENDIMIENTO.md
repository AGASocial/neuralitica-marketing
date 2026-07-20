# RENDIMIENTO — Estrategia de eficiencia de tokens de SpecFounder v2

> Cómo hacer SpecFounder v2 más rápido y barato **sin comprometer el resultado** (igualdad semántica, grill-me, memoria persistente). Léelo antes de tocar `core/`, `agents/`, `skills/` o `integrations/`.

---

## 1. Dónde se van realmente los tokens

El tamaño de los prompts **no** es el cuello de botella: el monolito y el coordinator se envían una vez y, con *prompt caching*, son casi gratis al repetirse. Los sumideros reales, en orden:

| # | Fuente | Por qué pesa | Palanca |
|---|---|---|---|
| 1 | **Código crudo en el hilo de la entrevista** (modo existente) | Cada archivo leído en la conversación se re-procesa en TODOS los turnos siguientes (~40). Miles de líneas × 40 turnos es el mayor gasto posible. | 🔴 Exploración en contexto aislado (§2) |
| 2 | **Número de turnos** | Cada turno re-procesa el historial completo. 40 turnos cuestan mucho más del doble que 20. | 🔴 Confirmación por lotes (§3) |
| 3 | **Checkpoint de cada turno** | La escritura más repetida del sistema (output cuesta ~5× el input). | 🟠 Journal append-only + cursor mínimo (§4) |
| 4 | **Carga de dominios/metodologías no usados** | Solo se usa un perfil y un adaptador por sesión. | 🟡 Carga perezosa (§5) |
| 5 | **Modelo sobredimensionado en tareas mecánicas** | Emitir plantillas o explorar no requiere el modelo de máximo razonamiento. | 🟡 Modelo por rol, donde aplica de verdad (§6) |

## 2. Palanca nº1 — Exploración en contexto aislado (sf-map)

En modo `existente`, el material crudo se lee en **sub-agentes exploradores** (uno por dimensión, en paralelo), cada uno con su propia ventana de contexto. Al hilo principal solo vuelve el **destilado**: afirmaciones de una línea con evidencia (`archivo:línea`), consolidadas en `SYSTEM-MAP.md`.

Efecto: un repo del que los exploradores leen 50.000 tokens de código aporta al hilo de la entrevista ~2.000 tokens de mapa. Sin esto, esos 50.000 tokens se re-procesarían en cada uno de los ~40 turnos siguientes. **Es la optimización más grande del sistema y además mejora la calidad** (lectura más amplia, con evidencia auditable).

En el monolito (sin sub-agentes): exploración **por etapas** — se lee una dimensión, se destila a afirmaciones, y solo entonces se pasa a la siguiente; el código crudo no se arrastra.

## 3. Palanca nº2 — Confirmación por lotes (menos turnos)

En modo `existente`, cada sección arranca con **UN turno** que presenta todo lo que el `SYSTEM-MAP.md` ya responde (con evidencia) y pregunta "¿corrijo algo?" (`S{n}.LOTE`). El grill-me continúa solo sobre lo `[ausente]`, lo refutado y lo corregido.

Una sesión brownfield típica baja de ~40 turnos a ~12-15. No viola "una pregunta por turno": esa regla protege el **descubrimiento** (no agrupar preguntas abiertas); confirmar hechos ya mapeados es otra operación.

## 4. Palanca nº3 — Checkpoint estructuralmente barato

El diseño v2.0 pedía "edición incremental" de un `session.md` largo — instrucción frágil: los modelos tienden a reescribir archivos enteros. v2.1 lo resuelve por **estructura**, no por instrucción (ver `persistence/STATE-SCHEMA.md`):

- **`journal.md` solo-append:** una línea por decisión. Append es la operación de escritura más barata y fiable que existe; el historial nunca se condensa (condensar cuesta tokens y pierde datos).
- **`session.md` mínimo (~25-35 líneas):** solo cursor (frontmatter + "Siguiente acción" + ramas abiertas). Reescribirlo entero cuesta menos que intentar editarlo.
- **`SPEC.draft.md` consolidado por sección:** un volcado al cerrar cada sección, no 40 escrituras. Turno a turno la respuesta ya está en el journal (resiliencia intacta).
- **Excepción:** `CONTEXT.draft.md` y los ADR se escriben al momento — la igualdad semántica y las decisiones irreversibles no esperan.

## 5. Carga perezosa (implementada, no solo recomendada)

- El comando `/iniciar` y el coordinator cargan **solo el perfil de dominio elegido** (no los 5).
- El **adaptador de metodología** se carga recién en la emisión (no al inicio).
- `sf-map` solo corre en modo existente; el Generador de Visión solo en modo nuevo.
- **Diseño para prompt caching:** prompt de sistema estático; el estado volátil (`session.md`, journal) se lee por herramienta cada turno. Así el bloque grande se cachea.
- No re-imprimir el draft completo al usuario cada turno: solo el delta + la siguiente pregunta. El SPEC/BIBLIA completo, solo en el cierre.

## 6. Modelo por rol — donde aplica de verdad

Regla mental: **el modelo de la sesión piensa y conversa; los modelos económicos leen y rellenan.**

**Lo que corre en el hilo principal** (entrevista, Visión, glosario, arquitecto) usa **el modelo de la sesión** — no hay forma de cambiar de modelo a mitad de conversación, y la entrevista es la conversación. Elige la sesión según la complejidad del proyecto: un modelo de máximo razonamiento (p. ej. la familia Claude Opus/Fable) para specs complejos; uno de equilibrio (Sonnet) para el resto.

**El tiering real está en los sub-agentes** (cada uno con `model:` propio en Claude Code):

| Sub-agente | `model:` | Por qué |
|---|---|---|
| `sf-explorer` | `sonnet` | Contexto grande, lectura > razonamiento profundo. |
| `sf-verifier` | `inherit` | Refutar exige juicio: hereda el modelo de la sesión. |
| `sf-emitter` | `haiku` | Relleno de plantillas casi determinista. |
| Comando `/ayuda` | `haiku` | Q&A de solo lectura sobre AYUDA.md. |

> ⚠️ **Las skills no tienen `model:` propio** — corren en el modelo de quien las invoca. Por eso el checkpoint corre en el modelo de la sesión: es aceptable porque el §4 lo hizo estructuralmente barato (una línea de append + un cursor pequeño), que ahorra más que cualquier cambio de modelo.

> **Monolito (Codex, Cursor, OpenCode, chat puro):** un solo agente ⇒ un solo modelo para toda la sesión (equilibrio por defecto; máximo razonamiento si el proyecto es complejo). El tiering por sub-agente es exclusivo de los harness que los soportan.

## 7. Qué NO sacrificar (no negociable)

La eficiencia jamás puede romper estas reglas inviolables:

- **Una pregunta de descubrimiento por turno** con recomendación (grill-me). Los lotes solo confirman hechos ya mapeados con evidencia; no agrupan descubrimiento.
- **Checkpoint antes de cada pregunta.** Barato sí; omitido no.
- **Igualdad semántica** y glosario puro (CONTEXT/ADR se escriben al momento, aunque cueste).
- **Evidencia en el mapa:** ninguna afirmación `[confirmado]` sin `archivo:línea`; lo `[inferido]` se verifica o se pregunta.
- La **normativa de Visión** (≤ 2 párrafos) y los **3 criterios de ADR**.

Si una optimización choca con cualquiera de estas, gana la regla.
