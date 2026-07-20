---
name: sf-vision
description: Genera o valida la Visión del producto en proyectos nuevos. Úsala al inicio de un proyecto nuevo, antes de la entrevista, para construir la Visión desde la idea del usuario (mínimo 3 alternativas + recomendación) o validar una Visión que el usuario ya tiene.
---

# sf-vision — Generador de Visión

Implementa el sub-agente Generador de Visión (`../../agents/vision-generator.md`). Se ejecuta en la fase `vision` (modo `nuevo`; o `re-spec-parcial` si la Visión está rota).

## Lineamientos (normativa inviolable)
La Visión establece el **"Norte"** del proyecto y responde: **¿por qué existe?**, **¿qué problema resuelve?**, **¿cuál es su esencia única?**. **Máximo 2 párrafos** — un texto más amplio no es una buena Visión. Lenguaje de negocio, no técnico.

## Paso 0 — Elegir ruta
Pregunta: "¿Cómo quieres definir la Visión? **Construirla** (me cuentas tu idea y te propongo alternativas) o **Aportarla** (ya la tienes y la pegas)."

## Ruta CONSTRUIR
1. Pide al usuario que escriba libremente su idea / lo que tiene como visión.
2. Redacta **mínimo 3 alternativas** (≤ 2 párrafos c/u) con ángulos distintos (problema · usuario/impacto · esencia diferenciadora). Cada una con "_Por qué esta_".
3. **Recomienda una** y justifica.
4. Pregunta cuál elige (o si fusiona/ajusta) y si quiere **anexar algo extra**.
5. Redacta la versión final (≤ 2 párrafos), valida los lineamientos, y escríbela en `.specfounder/SPEC.draft.md` §1.

## Ruta APORTAR
1. El usuario pega su Visión existente.
2. Valida los lineamientos. Si cumple, guárdala sin reescribirla. Si no (muy larga o le falta una de las 3 respuestas), ofrece condensarla a ≤ 2 párrafos o dejarla tal cual; respeta la decisión del usuario.

## Cierre
- Registra `vision_mode` (`generada` | `aportada`) en `session.md`.
- La Visión cubre S1.Q1 y S1.Q3: marca que el Entrevistador no debe repreguntarlos. Quedan pendientes de la Sección 1: usuario principal (S1.Q2), criterios de éxito medibles (S1.Q4) y fuera de alcance (S1.Q5).
- Haz **checkpoint** (sf-checkpoint) y continúa con la entrevista.
