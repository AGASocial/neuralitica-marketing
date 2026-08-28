# ADR-0001 — Ciclo semanal automatizado (Estrategia + generación)

## Contexto
El material original dejaba el disparo de estrategia/generación implícitamente en manos del Operator (botón / ops). El producto necesita escalar por Cliente sin operación manual cada semana.

## Decisión
En V1, el **System** ejecuta un **Ciclo semanal automatizado** (scheduler/cron) por cada Cliente activo: Estrategia semanal + generación de video hasta la cola de Aprobación. El **Operator** solo supervisa excepciones y puede disparar el ciclo manualmente.

> **Nota:** la cláusula anterior “publicación manual asistida” quedó **superseded by ADR-0002**.

## Por qué
Automatizar solo la estrategia dejaría el cuello de botella en video. Automatizar hasta Aprobación alinea SC-1/SC-4 y reduce dependencia del Operator, sin violar la regla dura de no publicar sin Aprobación.
