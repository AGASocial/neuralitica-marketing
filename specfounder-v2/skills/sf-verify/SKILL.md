---
name: sf-verify
description: Verificación adversarial. Intenta refutar las inferencias del SYSTEM-MAP antes de presentarlas al usuario, y hace la pasada anti-contradicciones del spec completo antes de emitir. Úsala tras sf-map (modo inferencias) y al entrar en fase de cierre (modo spec completo).
---

# sf-verify — Refutar antes de cementar

Ejecuta el sub-agente Verificador (`../../agents/verifier.md`). Su postura es adversarial: **busca el contraejemplo**, no la confirmación. Una inferencia errónea que el usuario confirme por descuido queda cementada en el spec y envenena todo lo que se genere después.

## Modo 1 — Verificar inferencias (tras sf-map)

1. Toma las afirmaciones `[inferido]` del `SYSTEM-MAP.md`.
2. Lanza verificadores (en paralelo si el entorno lo permite; agrupa afirmaciones afines por lote para no lanzar uno por trivialidad). Cada verificador:
   - Relee la evidencia citada: ¿de verdad sostiene la afirmación?
   - Busca activamente el contraejemplo en el material.
   - Devuelve veredicto: **verificado ✅** (con la evidencia adicional que descarta el contraejemplo) · **refutado ❌** (con el contraejemplo `archivo:línea` y la afirmación corregida) · **indecidible ⚠️** (→ pregunta de entrevista).
3. Actualiza el `SYSTEM-MAP.md` con los veredictos y registra el resultado en el journal.
4. Regla: ante la duda, indecidible. Un falso "verificado" es peor que una pregunta de más.

## Modo 2 — Pasada del spec completo (fase de cierre, antes de emitir)

Con `SPEC.draft.md` + `CONTEXT.draft.md` + `adr/` completos, busca en este orden:
1. Violaciones del glosario (sinónimos de _Evitar_ usados, términos sin definir, definidos y no usados).
2. Flujos (S4) imposibles con la arquitectura (S5).
3. NFR (S6) inalcanzables con la arquitectura — casi siempre un ADR faltante o una corrección.
4. Prioridades incoherentes (P1 que depende de P3; flujo crítico sobre módulo P3).
5. Criterios de éxito no medibles o que ninguna funcionalidad satisface.
6. Contradicciones entre secciones y contra los ADRs.

Salida: hallazgos con severidad (**bloquea-emisión** | advertencia) y corrección propuesta. Los bloqueantes se resuelven con el usuario ANTES de sf-emit. Registra la pasada en el journal.

## Reglas
- Solo lectura; el Verificador propone, el hilo principal decide con el usuario.
- Toda refutación lleva contraejemplo con evidencia; sin evidencia es opinión.
- Si no hay hallazgos, decláralo con las comprobaciones realizadas (no un "todo bien" vacío).
