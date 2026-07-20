# Adaptador de metodología — SDD genérico

> **Para:** equipos sin herramienta SDD instalada, o que quieren un spec portable.
> **Salida:** la salida clásica de SpecFounder v1. Es el destino más simple y migrable.

---

## Mapeo del spec neutral → artefactos

| Origen (`.specfounder/`) | Destino (raíz del proyecto) |
|---|---|
| `SPEC.draft.md` | `SPEC.md` |
| `CONTEXT.draft.md` | `CONTEXT.md` |
| `adr/0001-*.md`, … | `docs/adr/0001-*.md`, … |

No hay transformación estructural: las 6 secciones se copian tal cual. Es el "formato neutral" hecho permanente.

## Estructura resultante

```
proyecto/
├── SPEC.md          ← 6 secciones (Visión · Usuarios · Funcionalidades · Flujos · Arquitectura · No Funcionales)
├── CONTEXT.md       ← glosario canónico del dominio
└── docs/adr/
    ├── 0001-slug.md
    └── 0002-slug.md
```

## Handoff

```
### Handoff — SpecFounder v2 → SDD genérico

Usa SPEC.md y CONTEXT.md como tu fuente de verdad absoluta.
Los términos de CONTEXT.md son los únicos válidos para este dominio.
Antes de generar código, historias de usuario o pruebas, verifica que no contradigan SPEC.md.
docs/adr/ contiene decisiones irreversibles que debes respetar.
Si una tarea contradice el spec, señálalo antes de proceder.
```

## Del spec al plan

SDD genérico no tiene herramienta de planificación propia: usa la skill `sf-plan`, que deriva `PLAN.md` (fases ordenadas por prioridad P1 → P3) y `TASKS.md` (checklist trazable a secciones del SPEC) directamente del spec + ADRs.

## Migración posterior

Este formato se puede migrar después a OpenSpec o Spec-Kit sin reescribir el contenido: basta volver a ejecutar el Adaptador con otra `methodology`. Por eso es la recomendación por defecto cuando aún no hay herramienta elegida.
