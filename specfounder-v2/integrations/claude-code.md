# Integración — Claude Code

Claude Code es el harness de referencia de SpecFounder: soporta comandos, skills y sub-agentes nativos. La arquitectura correcta aquí es la **invertida**:

- **El hilo principal conduce la sesión** (vía `/iniciar`, que carga `core/coordinator.md`): selección, Visión, entrevista grill-me, glosario y vigilancia de ADRs son **interactivos**, y en Claude Code un sub-agente no puede conversar con el usuario (recibe un encargo y devuelve un informe final) ni invocar a otros sub-agentes. Por eso el "coordinator" **no se instala como sub-agente**.
- **Los sub-agentes hacen el trabajo batch**: explorar código en paralelo (`sf-explorer`), verificar afirmaciones (`sf-verifier`) y emitir artefactos (`sf-emitter`). Cada uno corre en su propia ventana de contexto — el código crudo que leen **nunca entra al hilo de la entrevista**, que es de donde sale el ahorro real de tokens (ver [`../RENDIMIENTO.md`](../RENDIMIENTO.md)).

## Instalación automática (recomendada)

Desde la raíz de este repo:

```bash
./scripts/install-claude-code.sh /ruta/a/tu/proyecto
```

El script instala en el proyecto objetivo:
- `.claude/specfounder/` — material de referencia (core, agents, monolith, domains, methodologies, persistence, RENDIMIENTO, AYUDA) con su estructura interna intacta.
- `.claude/commands/` — `/iniciar`, `/retomar`, `/ayuda` (con el frontmatter correcto, apuntando a la copia instalada).
- `.claude/agents/` — `sf-explorer` (sonnet) · `sf-verifier` (inherit) · `sf-emitter` (haiku), con `tools:` acotados.
- `.claude/skills/` — las 12 skills `sf-*` con rutas ajustadas.
- Un puntero en el `CLAUDE.md` del proyecto.

Después, abre Claude Code en el proyecto y escribe `/iniciar`.

## Instalación manual (si prefieres controlar cada pieza)

1. **Comandos** → copia [`../comandos/iniciar.claude-code.md`](../comandos/iniciar.claude-code.md), [`retomar.claude-code.md`](../comandos/retomar.claude-code.md) y [`ayuda.claude-code.md`](../comandos/ayuda.claude-code.md) a `.claude/commands/` como `iniciar.md`, `retomar.md`, `ayuda.md`. ⚠️ El frontmatter (`---`) debe quedar como lo **primero** del archivo — si algo lo precede, Claude Code no reconoce la descripción ni el `model:`.

2. **Sub-agentes (solo los no interactivos)** → crea en `.claude/agents/` un archivo por sub-agente, con frontmatter + el contenido del archivo correspondiente de `../agents/`:

   | Sub-agente | Fuente | `model:` | `tools:` | Por qué este modelo |
   |---|---|---|---|---|
   | `sf-explorer` | `explorer.md` | `sonnet` | Read, Grep, Glob, Bash | Lectura de contexto grande; no requiere el modelo de razonamiento máximo. |
   | `sf-verifier` | `verifier.md` | `inherit` | Read, Grep, Glob, Bash | Refutar exige juicio: hereda el modelo de la sesión. |
   | `sf-emitter` | `emitter.md` | `haiku` | Read, Grep, Glob, Write, Edit, Bash | Relleno de plantillas casi determinista. |

   ```markdown
   ---
   name: sf-explorer
   description: Explorador de dimensión de SpecFounder (solo lectura). Lo lanza sf-map en paralelo; devuelve afirmaciones con evidencia archivo:línea.
   model: sonnet
   tools: Read, Grep, Glob, Bash
   ---
   <contenido de specfounder-v2/agents/explorer.md>
   ```

   > **No instales** `interviewer`, `vision-generator`, `glossarist` ni `architect-adr` como sub-agentes: son **sombreros del hilo principal** (así lo documentan sus propios archivos). Un "entrevistador" sub-agente no puede hacer una entrevista: no ve la conversación ni puede esperar respuestas.

3. **Skills** → copia las carpetas de `specfounder-v2/skills/` a `.claude/skills/`:
   `sf-domain` · `sf-vision` · `sf-brief` (intake de material aportado) · `sf-map` · `sf-verify` · `sf-checkpoint` · `sf-resume` · `sf-glossary-sync` · `sf-explore` (alias) · `sf-emit` · `sf-validate` · `sf-plan` · `sf-drift`.

   > **Modelo de las skills:** una skill se ejecuta en el modelo del agente que la invoca; no tiene `model:` propio. El tiering fino se logra con los **sub-agentes** de arriba (que sí lo tienen): `sf-map` lanza `sf-explorer`, `sf-verify` lanza `sf-verifier`, `sf-emit` delega en `sf-emitter`.

4. **Material de referencia** → copia `domains/`, `methodologies/` y `persistence/` a `.claude/specfounder/` (o deja el repo clonado accesible) para que el coordinator cargue el perfil de dominio y el adaptador **perezosamente** (solo el activo, solo cuando toca).

5. **CLAUDE.md** → añade el puntero:
   ```markdown
   ## SpecFounder v2
   Para crear/retomar el spec usa /iniciar (o /retomar). El estado vive en .specfounder/.
   La sesión la conduce el hilo principal; sf-explorer/sf-verifier/sf-emitter hacen el trabajo batch.
   ```

## Uso

- **Iniciar:** `/iniciar` — pregunta el dominio (código o creativo), luego —si es código— la metodología, y el modo. En modo existente lanza `sf-map` (exploradores en paralelo) antes de entrevistar.
- **Retomar tras caída:** `/retomar` — lee `.specfounder/session.md` + journal y continúa donde quedó.
- **Ayuda:** `/ayuda` — guía de solo lectura (corre en `haiku`).
- **Permisos:** el agente necesita escribir en `.specfounder/`; los exploradores/verificador solo leen.

## Notas
- Al crear `.specfounder/`, el agente pregunta si **versionarlo en git** (recomendado en equipos: la sesión sobrevive a cambios de máquina) o ignorarlo. No es un default; es una decisión.
- Los artefactos finales que emite `sf-emitter` sí se versionan siempre.
