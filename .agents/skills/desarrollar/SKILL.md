---
name: desarrollar
description: Orquesta el desarrollo de neuralitica-marketing historia por historia mediante los gates del sprint. Úsala cuando el usuario diga “desarrollar”, “orquestar”, “siguiente historia”, pida continuar el sprint o invoque $desarrollar.
---

# Desarrollar

Actúa como el master orchestrator del proyecto. Este flujo coordina especialistas y gates; el agente principal no implementa código de producto.

## Cargar el protocolo

Antes de actuar:

1. Lee por completo `.cursor/agents/master-orchestrator.md` y adopta sus reglas como protocolo canónico.
2. Lee `.cursor/commands/desarrollar.md` para conservar el contrato del comando original.
3. Lee las fuentes canónicas que exige el protocolo, incluida `docs/development/SPRINT-STATE.md`.
4. Si una ruta requerida no existe, comprueba si fue movida antes de declarar un bloqueo.

Las reglas de seguridad y autorización vigentes de Codex prevalecen si alguna instrucción local entra en conflicto con ellas.

## Adaptación de Cursor a Codex

- Traduce cada delegación `Task` a un subagente de Codex.
- Para un especialista, lee primero `.cursor/agents/<especialista>.md` y entrega al subagente su rol, la historia, el gate, los artefactos de entrada, el resultado esperado y las rutas que posee.
- Indica a cada implementador que comparte el repositorio con otros agentes, que no revierta cambios ajenos y que se limite a sus archivos asignados.
- Usa subagentes `explorer` para investigación acotada y `worker` para cambios. No inventes tipos de subagente con los nombres de Cursor.
- Dentro de BUILD, lanza en paralelo solamente especialistas con rutas disjuntas. Espera a todos antes de VALIDATE.
- El agente principal puede leer, coordinar, actualizar artefactos de estado y realizar operaciones Git previstas por el protocolo, pero no escribir código de producto.
- Si un subagente no puede crear el commit solicitado, el orquestador puede hacerlo después de revisar el diff y las verificaciones.

## Arranque y continuidad

- Si el usuario no indicó historia, ejecuta `boot_command`: reanuda `current_story` desde `story_status`; si no existe una historia activa, selecciona la siguiente historia lista respetando fase y dependencias.
- Mantén una sola historia activa salvo que el usuario pida explícitamente modo batch.
- Actualiza `docs/development/SPRINT-STATE.md` después de cada transición de gate.
- Continúa automáticamente entre gates. Detente solo ante los bloqueos definidos por el protocolo o cuando una acción requiera nueva autorización del usuario.

## Git seguro

- Antes de cambiar de rama, inspecciona la rama y el estado del working tree. Conserva cualquier cambio preexistente del usuario y no cambies de rama si pudiera sobrescribirlo.
- Usa la rama `feature/{US-id}-{slug}` desde `main` para una historia nueva, sin worktrees.
- No hagas `pull`, push ni abras un PR salvo que sea seguro y esté autorizado por el protocolo o el usuario. No fuerces cambios sobre `main`.
- Mantén commits atómicos por cada BUILD o ciclo de fixes y sigue el estilo reciente del repositorio.
- Nunca incluyas secretos, `.env` ni cambios ajenos en un commit.

## Cierre del turno

Reporta de forma compacta:

`fase · historia · gate · delegación · veredicto · siguiente paso`

Si el flujo queda bloqueado, identifica el gate, la evidencia concreta y la decisión que necesita el usuario.
