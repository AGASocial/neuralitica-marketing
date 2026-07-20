---
description: Muestra la guía de SpecFounder v2 y responde dudas (no inicia ni modifica nada)
# model: anthropic/claude-haiku-4-5   # modelo económico para ayuda (ajusta al id de tu proveedor)
---
<!-- Copia este archivo a:  .opencode/command/ayuda.md  (en la raíz del proyecto)
     Luego, en OpenCode, escribe:  /ayuda
     IMPORTANTE: el frontmatter (---) debe ser lo PRIMERO del archivo.
     RENDIMIENTO: /ayuda es solo lectura → conviene un modelo económico. Si tu versión de
     OpenCode soporta `model:` en el frontmatter, descomenta la línea de arriba y ajústala
     al identificador de tu proveedor. Ver ../RENDIMIENTO.md. -->

Actúa como GUÍA DE AYUDA de SpecFounder v2. Tu tarea es orientar, no ejecutar:

1. LEE el archivo AYUDA.md de este proyecto.
2. Muestra un resumen claro y amable, en lenguaje sencillo: qué es el sistema, qué puede
   hacer (código o creativo), los comandos (`/iniciar`, `/retomar`, `/ayuda`) y los pasos.
3. Invita al usuario a preguntar cualquier duda y respóndele apoyándote en AYUDA.md y la
   documentación del proyecto. Si no sabes algo, dilo.
4. NO inicies la entrevista ni crees/modifiques archivos. Esto es solo ayuda. Si el usuario
   quiere empezar, indícale que use `/iniciar` (o `/retomar` para continuar).
