# Adaptador de metodología — GitHub Spec-Kit

> **Para:** equipos que usan GitHub Spec-Kit (la `specify` CLI) y su flujo `/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`.
> **Actualizado a:** la plantilla oficial vigente de `spec.md` (`templates/spec-template.md` del repo `github/spec-kit`): user stories priorizadas, FR/SC con ID, Given/When/Then. Si tu versión difiere, compara con lo que genere tu `specify init`.

---

## Modelo mental de Spec-Kit (vigente)

Spec-Kit ancla el desarrollo en una **constitution** (principios no negociables del proyecto) y luego trabaja **por feature**: cada una vive en `specs/NNN-nombre/` con su `spec.md` (el qué y el porqué, **sin tecnología**), del que derivan `plan.md`, `tasks.md` y artefactos de apoyo (research, data-model, contracts). El `spec.md` oficial es fuertemente estructurado: user stories **priorizadas e independientemente testeables**, requisitos `FR-NNN` con MUST, criterios de éxito `SC-NNN` medibles.

**Dónde encaja SpecFounder:** el desajuste clave es de **alcance** — SpecFounder produce un spec de *producto*; Spec-Kit especifica por *feature*. La emisión correcta NO es meter todo en un `specs/001-.../spec.md` gigante, sino:
1. La **constitution**, desde los ADRs + Secciones 5-6 + criterios de éxito globales.
2. **Un spec por módulo P1** de la Sección 3 (y opcionalmente P2), cada uno como feature Spec-Kit completa.
3. Los módulos P3 quedan documentados en la constitution/backlog como futuros `/speckit.specify`.

## Mapeo del spec neutral → artefactos

| Sección del spec neutral | Destino en Spec-Kit |
|---|---|
| `adr/` + Sección 5 (principios) + Sección 6 (NFR) | `.specify/memory/constitution.md` — principios y restricciones no negociables, cada uno con su racional |
| Sección 1 (Visión) | encabezado de cada `spec.md` (contexto del porqué) + constitution (norte del producto) |
| Sección 1 (criterios de éxito S1.Q4) | `Success Criteria` (`SC-NNN`) — los globales van a la constitution; los del módulo, a su spec.md |
| Sección 1 (fuera de alcance S1.Q5 + supuestos) | secciones `Out of Scope` / `Assumptions` del spec.md |
| Sección 2 (Usuarios) | actores de las User Stories |
| Sección 3 (Funcionalidades por módulo, P1-P3) | **un `specs/NNN-<modulo>/spec.md` por módulo P1** — funcionalidades → `FR-NNN`; prioridad del módulo → prioridad de sus stories |
| Sección 4 (Flujos: happy + error paths) | `Acceptance Scenarios` (Given/When/Then) y `Edge Cases` de cada spec.md |
| `CONTEXT.draft.md` (glosario) | `Key Entities` de cada spec.md (mapeo casi 1:1: término canónico → entidad, definición → descripción) + referencia desde la constitution |
| Sección 5 (stack concreto) | **NUNCA al spec.md**: constitution como restricción y después al `/speckit.plan` |

## Formato LITERAL de cada `specs/NNN-<modulo>/spec.md`

Sigue la plantilla oficial — estos son los bloques obligatorios:

```markdown
# Feature Specification: <Módulo>

**Feature Branch**: `NNN-<slug>` · **Created**: <fecha> · **Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - <título> (Priority: P1)
[El viaje del usuario en lenguaje llano — de las acciones por rol de la Sección 2]
**Why this priority**: [valor; por qué este nivel]
**Independent Test**: [cómo se prueba esta historia por sí sola y qué valor entrega]
**Acceptance Scenarios**:
1. **Given** <estado>, **When** <acción>, **Then** <resultado>   ← de los happy paths de S4

### Edge Cases
- <condición límite / error path de S4: qué pasa y qué ve el usuario>

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST <comportamiento observable, términos del glosario>
- **FR-002**: Users MUST be able to <interacción clave>

### Key Entities
- **<Término canónico>**: <definición del glosario, sin implementación>

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: <métrica medible y agnóstica de tecnología, de S1.Q4>

## Assumptions
- <supuestos capturados en la entrevista>

## Out of Scope
- <exclusiones de S1.Q5 que atañen a este módulo>
```

Reglas duras del formato:
- **Cero tecnología en el spec.md** (ni stack, ni librerías, ni APIs concretas). Si una funcionalidad arrastra decisión técnica → constitution y `/speckit.plan`.
- Cada user story es **independientemente testeable** (rebanada MVP): si implementas solo la P1, hay producto viable.
- `SC-NNN` medibles: "en menos de X segundos/pasos", "el N% de", nunca "fácil de usar".
- **Sin `[NEEDS CLARIFICATION]`**: SpecFounder no avanza con ramas abiertas, así que el spec sale sin marcadores. Si quedara alguno (modo glosario-urgente), déjalo explícito para `/speckit.clarify`.

## Estructura resultante

```
proyecto/
├── .specify/
│   └── memory/
│       └── constitution.md        ← principios + NFR + ADRs + SC globales + glosario referenciado
└── specs/
    ├── 001-<modulo-p1>/spec.md
    └── 002-<modulo-p1b>/spec.md   ← un spec POR MÓDULO P1, no uno gigante
```

## Validación (sf-validate, nivel 2)
- Grep de tecnología en los spec.md → mover a constitution.
- Presencia de todos los bloques mandatory (stories con prioridad + Independent Test, G/W/T, Edge Cases, FR-NNN, Key Entities, SC-NNN).
- Ningún sinónimo de las listas _Evitar_ del glosario.

## Handoff

```
### Handoff — SpecFounder v2 → GitHub Spec-Kit

.specify/memory/constitution.md fija los principios y restricciones no negociables (incluye los ADRs).
specs/NNN-<modulo>/spec.md especifican el QUÉ y el PORQUÉ de cada módulo P1, sin tecnología,
con el glosario canónico como Key Entities.

Siguiente paso: /speckit.plan sobre el spec del módulo P1 (la Sección 5 del spec neutral
y los ADRs son el contexto técnico que el plan necesita). Después /speckit.tasks, y
/speckit.analyze para verificar consistencia spec ↔ plan ↔ tasks.
Los términos del glosario son los únicos válidos. Si /plan o /tasks contradicen la constitution
o un spec, detente y señálalo.
```
