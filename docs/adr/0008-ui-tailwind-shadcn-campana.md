# ADR-0008 — UI stack: Tailwind CSS v4 + shadcn/ui (Campaña)

## Contexto
V1 UI was built PrimeReact-first. The product owner selected the dark **Campaña** visual concept (deep teal, butter/rose accents, Instrument Serif + Manrope) and directed a redesign off PrimeReact toward Tailwind CSS v4 and shadcn/ui primitives.

## Decisión
- Default UI stack is **Tailwind CSS v4** + **shadcn/ui** (Radix primitives), with Campaña design tokens as CSS variables in `app/globals.css`.
- Prefer composing `components/ui/*` before bespoke widgets; custom components remain exceptions when no primitive fits.
- User-facing copy stays in `messages/en.json` and `messages/es.json` (no hardcoded UI strings).
- Business logic, contracts, Server Actions, and DB schema are unchanged by this ADR.

## Consecuencias
- `AGENTS.md` / README architecture defaults say Tailwind + shadcn instead of PrimeReact-first.
- PrimeReact/primeicons are removed once remaining screens are migrated (tracked in the UI redesign branch).
- Focus states, keyboard access, and `prefers-reduced-motion` are required in new UI work.
