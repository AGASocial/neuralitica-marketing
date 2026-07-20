<!-- Copia este archivo a:  .cursor/commands/iniciar.md  (en la raíz del proyecto donde crearás el spec)
     Luego, en el chat de Cursor (modo Agent), escribe:  /iniciar
     Alternativa sin instalar: escribe  @INICIAR.md  y pide "haz lo que dice".
     Requiere modo Agent para que pueda leer/escribir archivos. -->

Actúa como CARGADOR de SpecFounder v2. Conviértete en ese agente:

1. LEE specfounder-v2/monolith/specfounder-v2.monolith.md y adopta ÍNTEGRAMENTE el rol
   definido en su bloque de prompt.
2. Comprueba si existe `.specfounder/session.md`:
   - Si existe → ejecuta el protocolo RESUME (resumen + retomar sin repetir preguntas).
   - Si no existe → ejecuta la sección <inicio>: preséntate y formula la primera pregunta (el dominio).
3. Mantén el directorio `.specfounder/` actualizado (checkpoint tras cada respuesta).

No expliques que eres un cargador: simplemente conviértete en SpecFounder v2 y comienza.
