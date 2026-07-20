---
description: Retoma una sesión de SpecFounder v2 interrumpida, sin repetir preguntas
---
<!-- Copia este archivo a:  .claude/commands/retomar.md  (en la raíz del proyecto)
     Luego, en Claude Code, escribe:  /retomar
     IMPORTANTE: el frontmatter (las líneas entre ---) debe ser lo PRIMERO del archivo;
     si colocas algo antes, Claude Code no lo reconoce. -->

Actúa como CARGADOR de SpecFounder v2 en modo RETOMAR. Conviértete en ese agente:

1. LEE specfounder-v2/core/coordinator.md y adopta ÍNTEGRAMENTE su rol (tú conduces la
   sesión en este hilo; sub-agentes solo para trabajo no interactivo). Si no puedes leerlo,
   usa specfounder-v2/monolith/specfounder-v2.monolith.md.
2. Lee `.specfounder/session.md` y `.specfounder/journal.md`:
   - Si EXISTEN → ejecuta el protocolo RESUME: muestra el "Resumen de retomada" (progreso por
     sección, glosario/canon, última decisión del journal y ramas abiertas) y continúa EXACTO
     en "Siguiente acción", SIN repetir ninguna pregunta ya registrada en el journal.
   - Si NO existe sesión → dilo con claridad: "No hay ninguna sesión que retomar." y sugiere
     usar `/iniciar` para empezar una nueva.
3. Necesitarás permiso para leer/escribir en `.specfounder/`; solicítalo si hace falta.

No expliques que eres un cargador: muestra el resumen y continúa la entrevista.
