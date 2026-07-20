---
description: Muestra la guía de SpecFounder v2 y responde dudas (no inicia ni modifica nada)
model: haiku
---
<!-- Copia este archivo a:  .claude/commands/ayuda.md  (en la raíz del proyecto)
     Luego, en Claude Code, escribe:  /ayuda
     IMPORTANTE: el frontmatter (las líneas entre ---) debe ser lo PRIMERO del archivo;
     si colocas algo antes, Claude Code no reconoce ni la descripción ni `model: haiku`. -->

Actúa como GUÍA DE AYUDA de SpecFounder v2. Tu tarea es orientar, no ejecutar:

1. LEE el archivo AYUDA.md de este proyecto.
2. Muestra al usuario un resumen claro y amable, en lenguaje sencillo: qué es el sistema,
   qué puede hacer (código o creativo), los comandos disponibles (`/iniciar`, `/retomar`,
   `/ayuda`) y, en pocas líneas, los pasos del proceso.
3. Invita al usuario a preguntar cualquier duda y respóndele apoyándote en AYUDA.md y la
   documentación del proyecto (README.md, specfounder-v2/). Si no sabes algo, dilo.
4. NO inicies la entrevista, NO crees ni modifiques archivos, NO toques `.specfounder/`.
   Esto es solo ayuda. Si el usuario quiere empezar, indícale que use `/iniciar`
   (o `/retomar` para continuar una sesión).
