# KAN-97 — Orchestrator chat model eval

## Goal

Compare `google/gemini-2.5-flash-lite` vs stronger Gateway models for owner-facing
orchestrator chat quality (plain language, no tool-name / chain-of-thought leak,
locale discipline).

## Prod smoke (2026-11)

`flash-lite` leaked English internal monologue and tool names into the visible
reply. Default was switched to **`google/gemini-2.5-flash`** (ADR-0009).

## Harness

```bash
# Offline fixtures only (no network, no spend)
node scripts/orchestrator-model-eval.mjs

# Optional live Gateway compare (uses AI Gateway credits; never HeyGen/TTS/video)
ORCHESTRATOR_EVAL_LIVE=1 node scripts/orchestrator-model-eval.mjs
```

Scoring:

1. **Leak score** — `sanitizeOrchestratorVisibleText` must not need to strip
   tool names / monologue markers from the model text (lower strip ratio = better).
2. **Locale** — when prompted for Spanish, reply should not be English-only CoT.
3. **Card discipline** — reply should not offer paid actions as bare text without
   implying a confirm card (heuristic: no “¿genero los videos?” without tool use
   in live multi-step runs). Offline harness also asserts Spanish routing:
   - “Quiero usar mi propio avatar” / “quiero salir yo en los videos” /
     “activa videos con mi cara” → `proposeEnableOwnAvatar` (consent redirect OK)
   - “¿Cuánto cuesta la voz para mi video?” → `proposeConfirmTtsGeneration`

## Decision (current)

| Model | Owner-visible leak risk | Default? |
|-------|-------------------------|----------|
| `google/gemini-2.5-flash-lite` | High (prod smoke) | No |
| `google/gemini-2.5-flash` | Acceptable with `sendReasoning: false` + sanitizer | **Yes** |
| `google/gemini-2.5-pro` | Stronger; use via `ORCHESTRATOR_CHAT_MODEL` if needed | Override only |

Re-run the harness after prompt/tool catalog changes. Do not flip the default
back to flash-lite without a green leak score on Spanish fixtures.
