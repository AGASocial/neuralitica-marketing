# STATE-SCHEMA — Memoria persistente de SpecFounder v2

> Este documento define **cómo SpecFounder v2 sobrevive a caídas**. Es el cimiento que referencian el `coordinator`, el `monolith` y las skills `sf-checkpoint` / `sf-resume`. Léelo antes que cualquier otro archivo del sistema.

---

## Por qué existe

En v1 toda la entrevista vivía en el contexto de la conversación. Si el aplicativo se cerraba, la red fallaba o el contexto se truncaba, **se perdía todo el progreso**. v2 persiste el estado en disco tras cada respuesta, de modo que cualquier sesión puede retomarse exactamente donde quedó, sin re-preguntar lo ya respondido.

Desde v2.1 el estado se divide en **cursor** (pequeño, se reescribe) y **journal** (histórico, solo-append). Esta separación hace el checkpoint barato y determinista: reescribir un archivo de ~25 líneas y añadir una línea al final de otro son operaciones que un LLM ejecuta de forma fiable, a diferencia de "editar incrementalmente" un archivo largo (que en la práctica tiende a reescribirse entero).

---

## El directorio `.specfounder/`

Se crea en la **raíz del proyecto objetivo** (no en este repo). Es la única fuente de verdad del progreso de una sesión.

```
.specfounder/
├── session.md            # CURSOR: en qué punto exacto está la sesión. Pequeño, se reescribe entero cada turno.
├── journal.md            # HISTÓRICO: log de decisiones, contradicciones y notas. SOLO-APPEND, nunca se edita ni condensa.
├── SPEC.draft.md         # Spec vivo (6 secciones); se consolida al CERRAR cada sección
├── CONTEXT.draft.md      # Glosario/canon vivo; se actualiza al aparecer cada término
├── SYSTEM-MAP.md         # (solo modo existente/re-spec) mapa del sistema con evidencia, generado por sf-map
└── adr/
    ├── 0001-slug.md      # ADRs borrador (solo si aplican los 3 criterios)
    └── ...
```

**Separación de responsabilidades:**
- `session.md` responde *"¿dónde estamos y qué toca ahora?"* — es lo primero que se lee al retomar.
- `journal.md` responde *"¿qué se decidió y en qué orden?"* — es la memoria completa; como es solo-append, nunca pierde historial y añadirle una línea cuesta casi nada.
- Los drafts contienen el **contenido**; el `SYSTEM-MAP.md` contiene lo que el código ya respondió, con **evidencia** (`archivo:línea`).

> **¿Versionar `.specfounder/` en git?** Es una decisión del usuario, no un default. Pregúntala al crear el directorio: **(a)** versionarlo — la sesión sobrevive a cambios de máquina y puede compartirse con el equipo (recomendado en equipos); **(b)** ignorarlo (`.gitignore`) — el progreso es local y solo se versionan los artefactos finales que emite el adaptador. Registra la elección en el journal.

---

## Esquema de `session.md` (el cursor)

Markdown con **frontmatter YAML** + un cuerpo mínimo. Se eligió markdown sobre JSON por portabilidad entre herramientas, fiabilidad de los LLM al leer/escribir, y porque un humano puede abrirlo y entender el progreso de un vistazo. **Debe mantenerse pequeño (~25-35 líneas):** al serlo, reescribirlo entero en cada checkpoint es barato y evita los errores de la "edición incremental".

```markdown
---
spec_founder_version: "2.1.0"
session_id: "2026-07-09-mi-proyecto"
created_at: "2026-07-09T10:00:00Z"
updated_at: "2026-07-09T10:42:00Z"
domain: "software"             # software | novela | serie-imagenes | guion-video | custom
methodology: "openspec"        # openspec | github-spec-kit | generic-sdd | creative-bible (SIEMPRE presente; en dominios creativos es creative-bible)
project_mode: "existente"      # nuevo | nuevo-con-material | existente | re-spec-parcial | glosario-urgente
project_name: "Mi Proyecto"
project_root: "/ruta/al/proyecto"
phase: "entrevista"            # seleccion | exploracion | vision | entrevista | cierre | emitido
vision_mode: "generada"        # generada | aportada | derivada (desde material, sf-brief) | "" si aún no se definió
current_section: 2             # 1..6  (0 = aún en selección)
current_question_id: "S2.Q3"   # id estable de la pregunta en curso
sections:                       # claves fijas s1..s6 (ranuras universales); su ETIQUETA depende del perfil de dominio
  s1_vision:        "completa"   # pendiente | en_curso | completa
  s2_actores:       "en_curso"
  s3_elementos:     "pendiente"
  s4_estructura:    "pendiente"
  s5_forma:         "pendiente"
  s6_restricciones: "pendiente"
glossary_terms: 7              # nº de términos del canon/glosario (detalle en CONTEXT.draft.md)
adr_count: 1
---

# Sesión: Mi Proyecto

## Siguiente acción (lo PRIMERO que se lee al retomar)
> Formular S2.Q3: "¿Existe un usuario anónimo no autenticado con acciones propias?
> Mi recomendación: sí, al menos lectura pública del catálogo."

## Ramas abiertas (deben cerrarse antes de avanzar de sección)
- [ ] S2: confirmar si "Operador" y "Supervisor" son roles distintos o el mismo con permisos.
```

**Todo lo demás** (log de decisiones, contradicciones resueltas, notas de retomada) vive en `journal.md`, no aquí.

### Campos obligatorios del frontmatter
`domain`, `methodology`, `project_mode`, `phase`, `current_section`, `current_question_id`, `sections.*`, `updated_at`. Sin estos, el resume no es fiable. En dominios creativos, `methodology` es siempre `creative-bible` (no se pregunta; se fija al elegir el dominio).

### IDs de pregunta estables
Formato `S{sección}.Q{n}` (p. ej. `S4.Q2`). Las preguntas adaptativas (no del guion base) se numeran `S{sección}.Qa{n}` (`a` = ad-hoc). Los turnos de **confirmación por lotes** (modo existente) usan el id `S{sección}.LOTE`.

---

## Esquema de `journal.md` (el histórico, solo-append)

Una línea por evento, con timestamp e id. **Nunca se edita, reordena ni condensa**: solo se añade al final. Es la fuente para reconstruir cualquier cosa que el cursor no diga.

```markdown
# Journal — Mi Proyecto
<!-- SOLO-APPEND: añadir líneas al final; nunca editar ni borrar las existentes. -->

- 2026-07-09T10:05Z · SEL · domain=software · methodology=openspec · mode=existente · specfounder_git=versionar
- 2026-07-09T10:08Z · MAP · sf-map: 4 exploradores · 23 afirmaciones (14 confirmadas, 6 inferidas, 3 ausentes) → SYSTEM-MAP.md
- 2026-07-09T10:15Z · S2.LOTE ✅ · roles confirmados desde código: Administrador, Operador, Cliente (corrigió: "Supervisor" no existe)
- 2026-07-09T10:20Z · S2.Q3 ✅ · acciones solo-admin: gestionar usuarios y tarifas. Recomendación aceptada.
- 2026-07-09T10:24Z · CANON · "Grupo" canonizado (_Evitar_: organización, cuenta) — contradicción resuelta con el usuario
- 2026-07-09T10:31Z · ADR-0001 · BaaS (Supabase) para v1 — difícil de revertir, trade-off validado
- 2026-07-09T10:40Z · NOTA · el usuario quiere revisar la Sección 4 con su socio antes de cerrar
```

Prefijos de evento: `SEL` (selección) · `MAP` (exploración/mapeo) · `S{n}.Q{m} ✅/❌` (decisión: recomendación aceptada/rechazada) · `S{n}.LOTE` (confirmación por lotes) · `CANON` (término/contradicción) · `ADR-NNNN` · `EMIT` (artefactos emitidos y rutas) · `NOTA` (libre).

---

## Protocolo de CHECKPOINT (regla inviolable del núcleo)

Tras **cada** respuesta del usuario, y **antes** de formular la siguiente pregunta, en este orden:

1. **Journal** — *append* de una línea con la decisión/evento del turno.
2. **Drafts según el tipo de dato**:
   - `CONTEXT.draft.md`: **inmediato** si apareció o cambió un término (la igualdad semántica no espera).
   - `adr/NNNN-*.md`: **inmediato** si se confirmó una decisión que cumple los 3 criterios.
   - `SPEC.draft.md`: se **consolida al cerrar cada sección** (un solo volcado por sección). Turno a turno, la respuesta ya quedó en el journal — si la sesión cae a mitad de sección, el resume reconstruye la sección en curso desde el journal.
3. **Reescribir `session.md` entero** (es pequeño): `updated_at`, estado de la sección, `current_question_id`, contadores, el bloque **"Siguiente acción"** con la pregunta exacta que toca y las ramas abiertas vigentes.
4. **Recién entonces** formular la siguiente pregunta al usuario.

> Si el agente formula una pregunta sin haber persistido el turno anterior, está violando el protocolo. El checkpoint es atómico respecto a la pregunta: primero se persiste, luego se pregunta.

### Excepción — chat puro (sin acceso a archivos)
No hay archivos que escribir: reimprime el **cursor** (equivalente a `session.md`) como bloque de texto tras cada turno y pide al usuario que lo guarde. Cada ~5 turnos, reimprime también el journal acumulado. Avisa de esta limitación al inicio.

---

## Protocolo de RESUME (al activarse el agente)

1. **Detectar**: ¿existe `.specfounder/session.md` en la raíz del proyecto?
   - **No existe** → sesión nueva. Ir a la fase de selección del `coordinator`.
   - **Sí existe** → continuar abajo.
2. **Cargar estado**: leer `session.md` completo + las **últimas ~15 líneas** de `journal.md` (no todo: el journal puede ser largo) + `CONTEXT.draft.md`. Leer `SPEC.draft.md` y `SYSTEM-MAP.md` solo si la fase lo requiere.
3. **Mostrar resumen de retomada** al usuario (sin re-preguntar nada):
   - Dominio, metodología y modo de la sesión.
   - Secciones completas vs pendientes.
   - Nº de términos del glosario y ADRs.
   - La última decisión registrada en el journal.
   - Las ramas abiertas que faltan cerrar.
4. **Confirmar y retomar**: "Retomo en **{Siguiente acción}**. ¿Continuamos?" — y al confirmar, formular esa pregunta exacta. No se repite ninguna pregunta cuyo id ya aparezca en el journal.

### Resumen de retomada — formato visible al usuario
```
🔄 Sesión recuperada — "Mi Proyecto" (software · OpenSpec · existente)

Progreso:
  ✅ Sección 1 · Visión
  ⏳ Sección 2 · Usuarios (en curso)
  ⬜ Secciones 3–6 pendientes
Glosario: 7 términos · ADRs: 1

Última decisión: acciones solo-admin definidas (S2.Q3).
Rama abierta: confirmar si "Operador" y "Supervisor" son el mismo rol.

▶️ Retomo aquí: S2.Q4 — ¿Existe un usuario anónimo con acciones propias?
   ¿Continuamos?
```

---

## Estados de fase (`phase`)

| Fase | Significado |
|------|-------------|
| `seleccion` | Eligiendo dominio, metodología y modo de proyecto (aún no empieza la entrevista). |
| `exploracion` | (Modos existente/re-spec/nuevo-con-material) `sf-map` mapea el código, o `sf-brief` organiza el material aportado → `SYSTEM-MAP.md`. |
| `vision` | (Solo proyecto nuevo, o re-spec con Visión rota) el Generador de Visión construye o valida la Visión (Sección 1). `vision_mode` registra si fue `generada` o `aportada`. |
| `entrevista` | Recorriendo las 6 secciones con grill-me (y confirmación por lotes en modo existente). |
| `cierre` | Todas las secciones completas; verificación (`sf-verify`/`sf-validate`) y revisión de SPEC/CONTEXT/ADRs. |
| `emitido` | El adaptador de metodología ya generó los artefactos finales y el handoff (y `sf-plan` si se pidió). |

---

## Regla de oro

> **El par `session.md` + `journal.md` siempre debe poder responder, por sí solo, la pregunta: "si todo se cae ahora mismo, ¿qué pregunta exacta toca hacer al volver, y qué se decidió hasta aquí?"** Si no puede, el checkpoint está incompleto.
