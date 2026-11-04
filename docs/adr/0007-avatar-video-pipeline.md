# ADR-0007 — Avatar video pipeline (HeyGen direct v3 + duration policy)

## Contexto
Avatar / talking-head Reels need reliable lip-sync, short total runtime, and
segmented talking-head clips mixed with B-roll — not 30s single-shot avatar
videos. Production evidence showed AI Gateway HeyGen audio correlation ~0.28
vs HeyGen direct API audio correlation ~0.992 when driving the avatar from our
ElevenLabs voiceover.

## Decisión

1. **Preferred avatar provider:** HeyGen **direct API v3** (`heygen_high`) —
   talking photo / Avatar III, **audio-driven** by our ElevenLabs voiceover,
   **9:16 720p** with cover crop. **AI Gateway** `ai_gateway_heygen_avatar`
   remains an active **fallback** when the direct key is missing or the direct
   adapter errors.
2. **TTS:** ElevenLabs **direct** TTS; voice chosen from avatar gender/language
   (`neuramark_avatars`), including optional clone `elevenlabs_voice_id`.
3. **B-roll:** AI Gateway Seedance fast (+ catalog fallbacks) for cutaways /
   faceless clips.
4. **Duration bounds** live in **`neuramark_reel_duration_policies`** (not
   scattered constants):
   - **Avatar** (`own_avatar` / `generic_avatar`): total **8–15s**; each avatar
     segment **≤8s**; **1–2** avatar segments; **B-roll cutaways allowed**.
   - **Faceless:** keep **15–45s**; no avatar segment fields.
   - Script generator (prompt + clamp), TTS duration validator, voiceover
     segment splitter, avatar job duration, and assembly all load via a cached
     server helper; hardcoded values are **fallback only** if DB load fails
     (logged).

## Por qué
Direct HeyGen audio-driven v3 materially improves lip-sync vs gateway video
generation. Short avatar totals with ≤8s segments + optional B-roll match
product pacing and provider clip limits; a single policy table keeps script,
TTS, jobs, and FFmpeg assembly aligned without duplicated magic numbers.
