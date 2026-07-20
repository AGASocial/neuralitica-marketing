# Perfil de dominio — Personalizado (cualquier propósito)

> **domain:** `custom`
> **Salida:** Biblia en Markdown por defecto (`methodologies/creative-bible.md`); o una metodología de código si el propósito resulta ser software.
> **Espina:** ver `_spine.md`.

SDD sirve para definir **cualquier** estructura, no solo las cuatro perfiladas. Este archivo explica cómo el agente **deriva un perfil al vuelo** cuando el propósito del usuario no encaja en `software`, `novela`, `serie-imagenes` o `guion-video` (p. ej. un podcast, un currículo de curso, un juego de mesa, una campaña de marketing, un mundo de rol, una receta de producto…).

## Cómo derivar un perfil nuevo

El agente NO inventa una estructura arbitraria: instancia la **espina universal** preguntando, una a la vez y con recomendación, cómo se llama cada ranura en el propósito del usuario.

1. **Confirma el propósito** en una frase: "¿Qué tipo de estructura quieres definir?"
2. **Propón el remapeo** de las 6 ranuras a nombres propios del propósito, como recomendación. Ejemplo para un curso:
   - 1 Visión → Objetivo de aprendizaje
   - 2 Actores → Perfil del estudiante / instructor
   - 3 Elementos → Módulos y lecciones
   - 4 Estructura/Flujo → Ruta de aprendizaje
   - 5 Forma → Formato y recursos
   - 6 Restricciones → Duración, prerequisitos, evaluación
3. **Confirma o ajusta** los nombres con el usuario antes de entrevistar.
4. **Define el canon/glosario** específico (términos que deben mantenerse consistentes).
5. **Entrevista** con grill-me usando esas secciones.
6. **Emite** la Biblia (por defecto) o, si el propósito es realmente software, ofrece las metodologías de código.

## Reglas
- Mantén siempre las 6 ranuras y los artefactos paralelos (canon + decisiones irreversibles): son lo que hace que el resultado sea un SPEC reutilizable y no un texto suelto.
- Toda Visión sigue la normativa: ≤ 2 párrafos, responde por qué existe / qué problema o necesidad atiende / esencia única.
- Registra en `session.md` el `domain: custom` y deja anotado el remapeo de secciones en el journal (línea `NOTA`), para que el resume reconstruya el perfil.
