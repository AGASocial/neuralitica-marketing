# Neuralitica — Mockup Prompts for Claude (Design)

Copy-paste prompts to generate UI mockups. Each prompt is **self-contained**: paste the **Global Context block** first, then ONE screen prompt per request. Ask for a single, complete, high-fidelity mockup per prompt (HTML/React artifact or image, your choice).

> Source of truth for behavior: `plan/USER_STORIES.md`. If a mockup contradicts a story's acceptance criteria, the story wins.

---

## Global Context block (paste this before every screen prompt)

```text
You are designing screens for "Neuralitica", a SaaS that produces 3 AI-generated
Instagram Reels per week for local service providers (plumbers, barbers, electricians).
Clients never record video: they answer an interview, pick a visual mode (own avatar
with consent / generic avatar / faceless), and approve content. Operators (internal
team) run production: strategies, scripts, video generation jobs, QA, publishing.

DESIGN SYSTEM & CONSTRAINTS
- Component library: PrimeReact (React). Use its patterns: DataTable, Card, Steps,
  Dialog, Toast, Tag, Badge, Menubar, Sidebar. Layout in the style of the PrimeReact
  "Sakai" admin template: fixed left sidebar navigation + topbar + content area.
- Look: modern, clean, professional SaaS. Light theme default. One accent color
  (suggest a deep violet/indigo), generous whitespace, rounded-lg cards, subtle borders.
- Typography: Inter or similar. Clear hierarchy, no decorative fonts.
- Localization: the app ships in English AND Spanish. Design with text expansion in
  mind (Spanish ~25% longer). Include a language switcher (EN/ES) in the topbar.
- Every screen must show realistic content for a sample client:
  "Plomería Rápida Monterrey" (a plumber in Monterrey, MX) — owner Gabriel Vega.
- Always design 4 states where relevant: loading (skeletons), empty (friendly CTA),
  error (recoverable message), success/normal.
- Desktop-first (1440px), but the Client Approval screen must be mobile-first (390px).
- Status color language (use consistently):
  draft=gray, generating/processing=blue, QA/review=amber, pending approval=orange,
  approved/active=green, failed/rejected=red, published=violet.
- Roles: some screens are Operator-only (internal), some are Client-facing. The brief
  states which. Client screens must be simpler and friendlier; Operator screens can be
  denser and data-heavy.
- Never show raw API costs on Client-facing screens (operator-only data).
```

---

## 1. App shell + Dashboard (US-X.1) — Client-facing

```text
Design the main Dashboard, the default screen after login.

Layout: Sakai-style shell — left sidebar (logo "Neuralitica", nav: Dashboard,
Interview, Business Profile, My Reels, Approvals, Settings), topbar (search,
EN/ES switcher, user menu "Gabriel Vega").

Dashboard content (cards/sections):
1. Onboarding status card: interview progress (e.g. "Interview 4/7 sections —
   Resume" button) OR "Profile ready" state with green check.
2. "This week's Reels" — 3 slots with thumbnail placeholder, title, status tag
   (draft / generating / in QA / pending your approval / approved / published).
3. "Pending approvals" — count + list of Reels waiting for the client, each with
   a prominent "Review" button.
4. Production status strip — small summary (e.g. "2 videos generating, 1 in QA").

Also design the EMPTY state: brand-new user, no interview started — hero card
inviting them to start the guided interview (primary CTA), everything else
in a locked/preview state.
```

## 2. Guided Business Interview (US-1.1, US-1.2) — Client-facing

```text
Design the step-by-step business interview wizard.

Layout: focused, centered content (~760px), sidebar collapsed or hidden to reduce
distraction. PrimeReact Steps component on top showing 7 sections:
Services · Zone · Tone · Offers · Objections · Style · Restrictions.

Show step 3 of 7 ("Tone") active with: a short friendly question ("How should your
business sound to customers?"), radio-card options with examples (Professional,
Friendly neighbor, Expert & direct, Fun), an optional free-text field, and helper
text. Validation error state on one required field ("Please pick a tone before
continuing").

Footer: Back / "Save & continue later" (secondary) / Next (primary), plus subtle
autosave indicator ("Draft saved 2 min ago").

Also design the RESUME state: a returning user's dashboard prompt card
("Your interview is 60% complete — resume where you left off").
```

## 3. Business Profile (US-2.1, US-2.2) — Client-facing

```text
Design the Business Profile page — a "living summary" of the client's business
generated from the interview.

Read-only default: sections as cards — Services (chips), Service zone (text + small
map placeholder), Tone of voice, Current offers, Common customer objections,
Brand notes, Restrictions (what we must never say), Visual mode (badge: e.g.
"Generic avatar" with a small disclosure note). Each section has an Edit (pencil)
affordance. Header shows profile version and "Last updated" timestamp.

Edit state: one section (Offers) switched to inline edit with Save/Cancel.
Also show a confirmation toast ("Profile updated — agents will use the new info
on the next run").

Empty state: no profile yet — CTA card pointing to the interview.
```

## 4. Visual Mode Selector + Consent (US-3.1, US-3.2, US-3.3) — Client-facing

```text
Design the "How will your Reels look?" screen.

Three large selectable cards side by side:
1. "Your own avatar" — AI avatar based on your photos. Requires explicit consent.
   Shows a consent checkbox + short legal disclosure text + version/date, and an
   upload area (photos/clips, format & size hints, previews, delete). Card is in a
   "locked" state until consent is checked.
2. "Generic avatar" — professional presenter, clearly NOT the owner. Info banner:
   "Videos will include a disclosure that the presenter is not the business owner."
3. "Faceless video" — voice + text + b-roll, no face on camera.

One card selected (Generic avatar) with a confirmation footer ("Save visual mode").
Include a warning dialog mock: user switching from Generic to Own avatar mid-week —
"Content already in production won't be regenerated."
```

## 5. Weekly Strategy Brief (US-4.1, US-4.2) — Operator-only

```text
Design the weekly content strategy screen for the OPERATOR (internal, data-dense).

Header: client selector (dropdown), week picker, "Generate strategy" primary button,
status tag (draft/approved), "Approved by Gabriel Vega · Jul 2" caption when approved.

Content: strategy brief as an editable document-like card —
- 3 pillars (chips): Trust, Education, Local offer
- 3 Reel slots as rows: day, theme, angle, CTA, target audience note. Inline-editable.
- "Insights" side panel: top 3 performing themes from recent weeks (small bars).

States: (a) generating — skeleton + progress note "Strategy agent running…",
(b) draft ready for review with "Approve strategy" CTA, (c) approved & locked with
a note "Scripts already generated — editing requires regeneration".
```

## 6. Reel Scripts (US-5.1, US-5.2, US-6.1, US-6.2) — Operator-only

```text
Design the scripts workspace for one week (OPERATOR view).

Master-detail: left = list of 3 Reels (title, day, duration target 15–45s, status).
Right = selected Reel with tabs: Script · Caption · Production.

Script tab: Hook (highlighted box), Body, CTA, On-screen text (with live char-count
warnings when text exceeds the per-beat max — show one warning state), Voiceover text
with word count vs duration estimate ("~38s of 45s target"), "Regenerate this Reel
only" secondary button, copy-to-clipboard icons per field.

Caption tab: Instagram caption textarea with char counter, hashtag chips (within max),
local keywords chips ("plomero Monterrey"), and 3 CTA variant radio-cards with
"Preview in context" showing the selected one appended to the caption.
```

## 7. Production & Jobs (US-7.1, US-8.4, US-9.1) — Operator-only

```text
Design the video production screen (OPERATOR, data-heavy).

Top: cost policy summary card — max budget per Reel, provider recommendation with
rationale ("Faceless + b-roll → LTX; est. $0.84"), estimated vs actual cost columns.

Main: PrimeReact DataTable of generation jobs — columns: Reel, provider (HeyGen/LTX/
manual), status (queued/processing/completed/failed with the standard colors),
attempt #, est. cost, actual cost, duration, updated. Row expansion shows failure
reason and lineage (retry of job #123).

Interactions to mock: (a) Retry confirmation dialog showing the NEW cost estimate and
remaining budget — retry disabled when over budget with explanatory tooltip,
(b) "Upload manual video" dialog (file dropzone, type/duration validation note),
(c) assembly progress state ("Assembling final 9:16 Reel — subtitles, logo, cover").
```

## 8. QA Report & Overrides (US-10.1, US-10.2) — Operator-only

```text
Design the QA/Compliance report panel for one assembled Reel (OPERATOR).

Header: Reel title + video thumbnail + overall QA status (pass / issues found).

Checklist: rows of automated checks with severity badges —
- Dangerous claims (pass)
- Tone matches profile (pass)
- AI disclosure present (FAIL, critical) — required because synthetic voice used
- Generic avatar not presented as owner (pass)
- CTA present (warning)
Each failed row: expandable evidence ("Script line 3: 'I personally guarantee…'")
and an "Override" button.

Override dialog: requires a reason (textarea, disabled submit until filled), shows
"This override is recorded and visible on the approval screen". Also show a
NON-overridable row style: consent/legal block ("Own avatar without valid consent —
cannot be overridden").
```

## 9. Client Approval (US-11.1, US-11.2, US-11.3) — Client-facing, MOBILE-FIRST

```text
Design the client approval experience at 390px width (mobile). This is the most
important client screen — friendly, simple, zero jargon.

Content, vertically stacked:
1. Vertical 9:16 video player (rounded, with play overlay) + duration.
2. AI disclosure line when applicable ("This video uses an AI presenter/voice").
3. Caption preview (collapsible), hashtags, selected CTA.
4. Any operator override notes, presented calmly ("Reviewed and approved by our team").
5. Action bar (sticky bottom): Approve (primary, green) · Request changes (secondary)
   · Reject (tertiary/danger, de-emphasized).

Request-changes flow: bottom sheet with a structured form (what to change: video /
caption / both; description textarea) + a notice "1 revision round included this
week" and the disabled state once the round is used ("Contact us for further
changes").

Approved state: confirmation screen with download links (video + caption) and
"Ready to publish" badge.
```

## 10. Content Calendar (US-12.1, US-12.2) — Operator-only

```text
Design the weekly content calendar (OPERATOR).

Week grid (Mon–Sun columns), Reels as cards in their scheduled day: thumbnail,
client name, title, status color (full status language), and a gap indicator when a
client has fewer than 3 Reels scheduled ("1 slot unfilled" warning card).

Interactions: clicking a card opens a side panel (Reel summary + link to detail);
"Mark published" action on approved Reels opening a small dialog (optional Instagram
post URL, publish date defaulting to today). Published cards show a violet check
and the IG link icon.

Include the EN/ES consideration: day/month labels must be localizable.
```

## 11. Auth screens (US-14.1–14.5) — Public + Client-facing

```text
Design the authentication screens as a cohesive set (centered card on a subtle
branded background, logo on top, minimal):

1. Login — email, password, "Forgot password?" link, submit. One generic error state:
   "Invalid email or password" (never reveals which).
2. Signup — name, business name, email, password (with strength hint: "at least 12
   characters"), submit. Post-submit state: "Check your email to confirm your account"
   (same screen whether or not the email already existed — design it neutral).
3. Email confirmed → Pending activation — friendly full-page state: "Your account is
   confirmed and awaiting activation by our team. We'll email you when it's ready."
   Shows only the user's own email. Logout link. No other data.
4. Reset password — request form (email, neutral confirmation state) AND the
   set-new-password screen (new password + confirm, policy hint, success state
   redirecting to login).
All EN first; include one screen (login) also rendered in Spanish to validate text
expansion.
```

## 12. Settings (US-3.1, US-7.1, US-9.2, US-X.2) — mixed

```text
Design the Settings page with tabs:

- Profile & Brand (Client): business info summary link, logo upload (with preview,
  "used on your videos"), preferred language (EN/ES).
- Visual mode (Client): current mode badge + link to the selector screen; consent
  status ("Consent given Jul 2, 2026 · v1.2" with revoke option and a serious
  confirmation dialog explaining consequences).
- Voice (Client): AI voice picker — 4 voice cards with play button, language tag
  (ES/EN), and tone hint; selected state.
- Cost policy (OPERATOR-ONLY tab, visually marked "Internal"): max cost per Reel
  input, quality tier select, provider preferences table.
```

---

## How to use

1. Paste the Global Context block + ONE screen prompt into Claude.
2. Ask for iterations on the same chat to keep visual consistency ("same design
   system, now screen 5").
3. Save approved mockups under `plan/mockups/` (e.g. `plan/mockups/01-dashboard.png`
   or `.html`) so the `nextjs-frontend` agent can use them as the visual reference
   when implementing the corresponding story.
4. The mockups inform layout and styling only — behavior and validation always come
   from the story's acceptance criteria and `CONTRACT.md`.
