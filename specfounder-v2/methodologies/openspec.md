# Adaptador de metodología — OpenSpec

> **Para:** equipos que usan OpenSpec (`@fission-ai/openspec`, Node ≥ 20) y su workflow guiado por artefactos `/opsx:*`.
> **Actualizado a:** OpenSpec 2026 (workflow `/opsx`, delta specs, `openspec validate`). Si tu versión difiere, ejecuta `openspec update` y compara con lo que genere tu CLI.

---

## Modelo mental de OpenSpec (vigente)

Dos carpetas y cinco ideas:
1. **`openspec/specs/` es la verdad**: describe cómo se comporta el sistema *hoy*, organizada por dominio/capability (`auth/`, `payments/`…). Specs = requisitos (redacción **SHALL**) + escenarios (Given/When/Then).
2. **Un cambio = una carpeta** en `openspec/changes/<id>/` con `proposal.md`, `design.md`, `tasks.md` y sus **delta specs**.
3. **Los deltas describen el diff** (`## ADDED/MODIFIED/REMOVED Requirements`), no el mundo entero.
4. **Los artefactos se encadenan**: proposal → specs → design → tasks → implement ("enablers, not gates").
5. **Archivar** (`/opsx:archive`) funde los deltas en `specs/` y cierra el ciclo.

**Dónde encaja SpecFounder:** produce la **fundación** — el contexto del proyecto (`project.md`), el glosario canónico y las **capabilities base** en `specs/` que representan lo acordado/existente. El trabajo nuevo NO se emite a mano en `changes/`: se propone con `/opsx:propose`, que es quien genera proposal/design/tasks con el formato correcto. OpenSpec tiene su propio onboarding brownfield (`/opsx:onboard`); el valor diferencial de SpecFounder es llegar a ese punto con **igualdad semántica, visión validada, prioridades y ADRs** ya resueltos.

## Prerequisito de emisión

Si la CLI está disponible: `openspec init` en el proyecto (genera la estructura y los slash-commands) **antes** de emitir. Si no lo está, emite la estructura estándar y dilo en el handoff.

## Mapeo del spec neutral → artefactos

| Sección del spec neutral | Destino en `openspec/` |
|---|---|
| Sección 1 (Visión + criterios de éxito + fuera de alcance) + `CONTEXT.draft.md` | `openspec/project.md` — propósito, contexto, glosario, convenciones |
| Sección 2 (Usuarios) | `project.md` (roles) y actores de los escenarios |
| Sección 3 (Funcionalidades, con prioridades P1-P3) + Sección 4 (Flujos) | `openspec/specs/<capability>/spec.md` — una capability por módulo **P1/P2** (los P3 se listan en `project.md` como futuros; no crees specs vacíos) |
| Sección 5 (Arquitectura) + `adr/` | `project.md` (stack/convenciones) + ADRs como restricciones que todo `design.md` futuro debe respetar |
| Sección 6 (No Funcionales) | restricciones transversales en `project.md` y como requisitos en la capability afectada |

## Formato LITERAL de cada `specs/<capability>/spec.md`

Esto es lo que `openspec validate` espera — respétalo al carácter:

```markdown
## Purpose
[1-2 oraciones: qué cubre esta capability y por qué existe]

## Requirements

### Requirement: <nombre del requisito>
The system SHALL <comportamiento observable, con los términos canónicos del glosario>

#### Scenario: <nombre del escenario>
- **GIVEN** <estado inicial, del happy path o error path de la Sección 4>
- **WHEN** <acción>
- **THEN** <resultado observable>
```

Reglas duras del formato:
- Cada requisito usa `### Requirement:` (con los dos puntos) y redacción **SHALL**.
- **Cada requisito lleva al menos un `#### Scenario:`** — los flujos de la Sección 4 (happy + error paths) son la materia prima; un flujo → 1-3 escenarios.
- Los términos del glosario son las únicas palabras válidas para las entidades.

## Estructura resultante

```
proyecto/
└── openspec/
    ├── project.md                 ← contexto + glosario + stack + NFR + prioridades
    ├── specs/
    │   ├── <capability-p1>/spec.md
    │   └── <capability-p2>/spec.md
    └── changes/                   ← VACÍO: el trabajo nuevo se propone con /opsx:propose
```

> **Proyecto existente:** solo se emiten a `specs/` las capabilities **confirmadas** (por código con evidencia del SYSTEM-MAP, o por el usuario en los lotes). Lo propuesto/deseado no es "truth" — irá naciendo como changes.
> **Proyecto nuevo:** las capabilities base describen el acuerdo inicial; el primer incremento real se arranca con `/opsx:propose <primer-cambio-P1>` (sf-plan sugiere la cola de cambios por prioridad).

## Validación (obligatoria)

- Con CLI: `openspec validate --strict` — corrige hasta que pase.
- Sin CLI: checklist manual de sf-validate (Purpose+Requirements, `### Requirement:` + SHALL, ≥1 `#### Scenario:` por requisito, Given/When/Then).

## Handoff

```
### Handoff — SpecFounder v2 → OpenSpec

openspec/project.md es el contexto base; openspec/specs/ son las capacidades acordadas (la "truth").
El glosario de project.md define los únicos términos válidos del dominio; los ADRs son restricciones
que todo design.md debe respetar.

Siguiente paso: /opsx:propose <primer-cambio-P1>   (¿no sabes cuál? /opsx:explore, o pide sf-plan)
Al terminar cada cambio: /opsx:archive para fundirlo en specs/.
Valida cuando quieras con: openspec validate --strict
```

## Nota de filosofías

OpenSpec es deliberadamente fluido ("enablers, not gates"); SpecFounder es deliberadamente riguroso (no avanza con ramas abiertas). No chocan: la rigidez aplica a la **fundación** (los términos y acuerdos que no deben ser ambiguos) y la fluidez al **flujo de cambios** posterior. El handoff marca esa frontera.
