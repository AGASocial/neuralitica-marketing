# Integración — Antigravity

Antigravity (IDE agéntico de Google) se guía por archivos de **reglas/instrucciones del workspace** y workflows. No expone la orquestación de sub-agentes de Claude Code, así que se usa el **monolito portable**.

## Instalación

1. Coloca el monolito como regla/instrucción del workspace. Según tu versión, el archivo de reglas puede ser `AGENTS.md` en la raíz o un archivo de reglas dentro de la configuración de Antigravity. Usa el que tu versión reconozca.
2. Pega el bloque de `specfounder-v2/monolith/specfounder-v2.monolith.md` bajo un encabezado:
   ```markdown
   # SpecFounder v2 (modo SDD)
   Cuando se pida crear o retomar el spec del proyecto, sigue estas instrucciones:

   <bloque del monolito>
   ```
3. Concede al agente permiso de escritura en el workspace para crear `.specfounder/`.

## Uso

- **Iniciar:** pide al agente "Crea el spec de este proyecto con SpecFounder v2". Preguntará metodología y modo.
- **Retomar:** "Retoma la sesión de SpecFounder" → leerá `.specfounder/session.md`.
- **Checkpoint:** el monolito persiste el estado tras cada turno.

## Notas
- Confirma el mecanismo exacto de reglas/instrucciones contra tu versión de Antigravity; el ecosistema es nuevo y los nombres pueden cambiar. Lo esencial es que el contenido del monolito quede como instrucción persistente del agente.
- `.specfounder/` a `.gitignore` durante la sesión.
