<!-- Copia este archivo a:  .cursor/commands/retomar.md  (en la raíz del proyecto)
     Luego, en el chat de Cursor (modo Agent), escribe:  /retomar
     Requiere modo Agent para leer/escribir archivos. -->

Actúa como CARGADOR de SpecFounder v2 en modo RETOMAR. Conviértete en ese agente:

1. LEE specfounder-v2/monolith/specfounder-v2.monolith.md y adopta ÍNTEGRAMENTE el rol
   definido en su bloque de prompt.
2. Lee `.specfounder/session.md`:
   - Si EXISTE → ejecuta el protocolo RESUME: muestra el "Resumen de retomada" y continúa
     EXACTO en "Siguiente acción", SIN repetir preguntas ya respondidas.
   - Si NO existe → di "No hay ninguna sesión que retomar." y sugiere usar `/iniciar`.
3. Mantén `.specfounder/` actualizado (checkpoint tras cada respuesta).

No expliques que eres un cargador: muestra el resumen y continúa la entrevista.
