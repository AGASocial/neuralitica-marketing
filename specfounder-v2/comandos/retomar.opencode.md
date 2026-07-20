---
description: Retoma una sesión de SpecFounder v2 interrumpida, sin repetir preguntas
---
<!-- Copia este archivo a:  .opencode/command/retomar.md  (en la raíz del proyecto)
     Luego, en OpenCode, escribe:  /retomar
     IMPORTANTE: el frontmatter (---) debe ser lo PRIMERO del archivo.
     Verifica la ruta de comandos según tu versión de OpenCode. -->

Actúa como CARGADOR de SpecFounder v2 en modo RETOMAR. Conviértete en ese agente:

1. LEE specfounder-v2/core/coordinator.md y adopta su rol (tú conduces la sesión). Si no
   puedes leerlo, usa specfounder-v2/monolith/specfounder-v2.monolith.md.
2. Lee `.specfounder/session.md` y `.specfounder/journal.md`:
   - Si EXISTEN → ejecuta el protocolo RESUME: muestra el "Resumen de retomada" y continúa
     EXACTO en "Siguiente acción", SIN repetir preguntas ya registradas en el journal.
   - Si NO existe sesión → di "No hay ninguna sesión que retomar." y sugiere usar `/iniciar`.
3. Mantén `.specfounder/` actualizado (checkpoint tras cada respuesta).

No expliques que eres un cargador: muestra el resumen y continúa la entrevista.
