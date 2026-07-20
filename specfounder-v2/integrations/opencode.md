# Integración — OpenCode

OpenCode soporta agentes definidos en markdown y también lee convenciones tipo `AGENTS.md`. Puedes usar la versión multi-agente o el monolito.

## Opción A — Multi-agente (recomendada si tu versión de OpenCode soporta agentes custom)

1. Crea un agente por archivo en el directorio de agentes de OpenCode (p. ej. `.opencode/agent/` del proyecto o el global de tu config). Usa el frontmatter que pida tu versión:
   ```markdown
   ---
   description: Orquestador SDD con memoria persistente
   ---
   <contenido de specfounder-v2/core/coordinator.md>
   ```
   Repite para los sub-agentes de `specfounder-v2/agents/`.
2. Las skills de `specfounder-v2/skills/` se documentan como procedimientos referenciados desde el coordinador (OpenCode no usa el formato SKILL.md de Claude Code; el contenido sigue siendo válido como instrucción).

## Opción B — Monolito (máxima compatibilidad)

1. Crea/edita `AGENTS.md` en la raíz del proyecto.
2. Pega el bloque de `specfounder-v2/monolith/specfounder-v2.monolith.md`.

## Comando `/iniciar` (recomendado)

Copia a `.opencode/command/` los tres cargadores: [`../comandos/iniciar.opencode.md`](../comandos/iniciar.opencode.md) → `iniciar.md`, [`../comandos/retomar.opencode.md`](../comandos/retomar.opencode.md) → `retomar.md`, [`../comandos/ayuda.opencode.md`](../comandos/ayuda.opencode.md) → `ayuda.md`. Luego usa `/iniciar`, `/retomar` o `/ayuda`.

## Uso

- **Iniciar:** `/iniciar` (o invoca el agente coordinador / pide "Crea el spec con SpecFounder v2").
- **Retomar:** `/retomar` → el agente detecta `.specfounder/session.md` y continúa.
- Verifica que OpenCode tenga permiso de escritura para `.specfounder/`.

## Notas
- Confirma las rutas exactas de configuración contra tu versión de OpenCode; han cambiado entre releases.
- `.specfounder/` a `.gitignore` durante la sesión.
