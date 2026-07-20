# Integración — Cursor

Cursor usa **reglas** en `.cursor/rules/*.mdc` (Project Rules). No orquesta sub-agentes como Claude Code, así que se usa el **monolito portable** como regla.

## Instalación

1. Crea `.cursor/rules/specfounder-v2.mdc` en la raíz del proyecto.
2. Añade el frontmatter de regla de Cursor y pega el monolito:
   ```markdown
   ---
   description: SpecFounder v2 — sesión SDD con memoria persistente
   alwaysApply: false
   ---
   <bloque de specfounder-v2/monolith/specfounder-v2.monolith.md>
   ```
   - `alwaysApply: false` y descripción clara → la regla se aplica cuando pidas crear/retomar el spec. Si prefieres invocarla a mano, puedes referenciarla con `@specfounder-v2` en el chat.

## Comando `/iniciar` (recomendado)

Copia a `.cursor/commands/` los tres cargadores: [`../comandos/iniciar.cursor.md`](../comandos/iniciar.cursor.md) → `iniciar.md`, [`../comandos/retomar.cursor.md`](../comandos/retomar.cursor.md) → `retomar.md`, [`../comandos/ayuda.cursor.md`](../comandos/ayuda.cursor.md) → `ayuda.md`. Luego usa `/iniciar`, `/retomar` o `/ayuda` en el chat (modo Agent). Sin instalar comando, también puedes escribir `@INICIAR.md` o `@AYUDA.md` y pedir "haz lo que dice".

## Uso

- **Iniciar:** `/iniciar` (o, en modo Agent, pide "Crea el spec de este proyecto con SpecFounder v2"). Preguntará el dominio, luego metodología (si es código) y modo.
- **Retomar:** `/retomar` (o "Retoma la sesión de SpecFounder") → leerá `.specfounder/session.md`. Asegúrate de que el modo Agent tenga permiso para crear/escribir archivos.
- **Checkpoint:** el monolito obliga a persistir en `.specfounder/session.md` tras cada turno.

## Notas
- Usa el modo **Agent** (no solo chat) para que pueda escribir los archivos de `.specfounder/` y los artefactos finales.
- `.specfounder/` a `.gitignore` durante la sesión.
