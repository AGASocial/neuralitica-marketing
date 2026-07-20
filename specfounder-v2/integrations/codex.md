# Integración — Codex (OpenAI Codex CLI)

Codex se guía por un archivo `AGENTS.md` en la raíz del proyecto y no expone sub-agentes con orquestación como Claude Code. Usa el **monolito portable**.

## Instalación

1. Crea (o amplía) `AGENTS.md` en la raíz del proyecto.
2. Pega dentro el contenido del bloque de `specfounder-v2/monolith/specfounder-v2.monolith.md`, bajo un encabezado claro:
   ```markdown
   # SpecFounder v2 (modo SDD)
   Cuando se te pida crear o retomar el spec de este proyecto, actúa según las siguientes instrucciones:

   <bloque del monolito>
   ```
3. Asegúrate de que Codex tiene permiso de escritura en el workspace para crear `.specfounder/`.

## Comando `/iniciar` (recomendado)

Copia a `~/.codex/prompts/` los tres cargadores: [`../comandos/iniciar.codex.md`](../comandos/iniciar.codex.md) → `iniciar.md`, [`../comandos/retomar.codex.md`](../comandos/retomar.codex.md) → `retomar.md`, [`../comandos/ayuda.codex.md`](../comandos/ayuda.codex.md) → `ayuda.md`. Luego usa `/iniciar`, `/retomar` o `/ayuda`. (En VSCode + Copilot, el mismo texto va en `.github/prompts/iniciar.prompt.md`, `retomar.prompt.md` y `ayuda.prompt.md`.)

## Uso

- **Iniciar:** `/iniciar` (o pide "Crea el spec de este proyecto con SpecFounder v2"). Preguntará el dominio, luego metodología (si es código) y modo.
- **Retomar:** `/retomar` (o "Retoma la sesión de SpecFounder") → leerá `.specfounder/session.md` y continuará. Si no encuentra el archivo, lo dirá y sugerirá `/iniciar`.
- **Checkpoint:** el monolito ya obliga a reescribir `.specfounder/session.md` tras cada turno.

## Notas
- Si trabajas en modo de aprobación restringida, autoriza la escritura en `.specfounder/`.
- Añade `.specfounder/` a `.gitignore` durante la sesión.
