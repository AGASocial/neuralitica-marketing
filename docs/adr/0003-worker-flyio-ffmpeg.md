# ADR-0003 — Worker Fly.io para trabajo largo / FFmpeg

## Contexto
El Ciclo semanal y el ensamblado requieren jobs de minutos (polls a providers, download-and-own, FFmpeg). Las Vercel Functions no son el runtime adecuado (timeouts; FFmpeg).

## Decisión
**Vercel** hospeda la app Next.js y el Cron (solo encola/dispara). **Supabase** guarda estado de jobs y assets. Un **worker Docker en Fly.io** (con FFmpeg) ejecuta pipelines largos: provider polls, fetch de assets, ensamblado, actualización de estados `neuramark_*`.

## Por qué
Separa UI/API del cómputo pesado; el equipo ya tiene cuenta Fly.io; encaja con volumen V1 bajo sin forzar FFmpeg en serverless.
