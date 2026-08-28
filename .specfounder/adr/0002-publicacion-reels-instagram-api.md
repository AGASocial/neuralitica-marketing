# ADR-0002 — Publicación de Reels vía Instagram Business API

## Contexto
El plan V1 asumía publicación manual asistida. Existe una integración Graph Instagram ya probada (karidecor: token server-side, container → publish) y el producto necesita publicar **Reels** desde el sistema sin saltarse la Aprobación del Cliente.

## Decisión
Tras Aprobación, Neuralitica publica Reels con Instagram Business / Graph API (credenciales solo en servidor). Modos V1: **botón “Publicar ahora”** y **programación/auto opcional**. Nunca publicar sin Aprobación. Patrón de referencia: karidecor `lib/instagram`, adaptado a video/Reels (no solo imagen).

## Por qué
Cierra el loop operativo hasta Instagram sin violar SC-2; el botón reduce riesgo; la programación escala; reutilizar un patrón ya validado acelera V1.
