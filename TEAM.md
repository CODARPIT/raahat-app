# Team plan: who owns what

Four people, four lanes. Each lane owns its own files, so everyone can work in parallel
without stepping on each other. If you need to change a file in someone else's lane,
tell them first (or ask them to make the change).

| Lane | Owner | One-line goal |
|---|---|---|
| 1. AI & triage brain | **Arpit** | Raahat's judgements are right, explainable and hard to fool |
| 2. Frontend & UX | **Arpan** | It looks and feels like a real product a control room would trust |
| 3. Cloudinary, Telegram & deployment | **Garv** | Every Cloudinary feature works live, and the demo never goes down |
| 4. Research, testing, docs & pitch | **Aviraj** | We can prove it works, and judges understand why it matters |

---

## Lane 1: AI & triage brain (Arpit)

**Owns:** `src/lib/vision.ts`, `src/lib/triage.ts`, `src/lib/place.ts`, `src/lib/exif.ts`,
`tests/triage.test.ts`, `scripts/seed.ts`

**Make it extraordinary:**
1. **Known old photos library (P2 in the build prompt).** Upload 10–20 famous recycled disaster photos to
   `raahat/known_old` (tag `raahat_known_old`, caption in context). On triage, compare the phash; a match adds the
   review reason "Matches an older photo from <caption>". This answers the judge question "do you detect fake photos?" with a live demo.
2. **Tune the AI prompts on real photos.** Run 30+ real flood/fire/collapse photos through `ai_vision_general`
   and fix what it gets wrong (water depth, people count, place names). Keep a before/after table for Aviraj.
3. **More languages for the rule-based fallback:** Bengali and Assamese keywords (north-east floods), Marathi.
4. **Video reports end to end:** check that the `so_2` still works with AI Vision and the 4 s preview plays.

## Lane 2: Frontend & UX (Arpan)

**Owns:** `src/app/**/page.tsx`, `src/app/layout.tsx`, `src/components/*`, `src/app/globals.css`, `src/lib/i18n.ts`

**Make it extraordinary:**
1. **Control room polish:** keyboard shortcuts (J/K to move, V/D/R for status, P to pin), a clear empty state,
   a "new report" flash when one arrives, sticky detail panel on desktop, a usable layout on a phone.
2. **Offline sending on the report page:** if the upload fails (no signal), keep the photo in the browser and
   retry automatically when the connection comes back, with a visible "waiting for signal" state.
3. **Landing page that tells the story in 10 seconds:** live counts on the gauge staff, the Telegram steps,
   a 3-step visual of one photo becoming a ranked report.
4. **Accessibility and small screens:** visible focus, no horizontal scroll at 360 px, reduced motion respected,
   Hindi text never clipped. Dark mode toggle.

## Lane 3: Cloudinary, Telegram & deployment (Garv)

**Owns:** `src/lib/cld-url.ts`, `src/lib/cloudinary.ts`, `src/lib/reports.ts`, `src/lib/telegram.ts`, `src/lib/check.ts`, `src/lib/whatsapp.ts`,
`src/lib/geocode.ts`, `src/app/api/*`, `tests/telegram.test.ts`, `tests/whatsapp.test.ts`, `.env.example`, Vercel and Telegram bot settings

**Make it extraordinary:**
1. **Telegram live:** create the bot with @BotFather, add `TELEGRAM_*` env vars in Vercel, run
   `npm run telegram:setup`, then test photo → "Send my location" → reply with tracking link → report on the map.
   Forward a photo to check the fact-check reply. Fix anything that breaks with real Telegram traffic.
2. **Private originals:** upload as `authenticated` and sign delivery URLs for originals and face-revealed
   images (fixes a "known limit" in the README).
3. **Instagram account:** create it, set `INSTAGRAM_HANDLE`, and post the fact-check card (from `/v/<id>`) for each
   report the control room verifies or marks false. Never post an undecided report.
4. **Demo safety:** `/api/health` green, AI quota checked, preview links viewable (Vercel → Deployment
   Protection off for previews), env vars documented. After judging: move the Vercel project so everyone has access.

## Lane 4: Research, testing, docs & pitch (Aviraj)

**Owns:** `README.md`, `docs/` (create it), the Notion page, the demo video, the pitch, `scripts/seed.example.json`

**Make it extraordinary:**
1. **Prove the AI works:** a labelled set of 30–50 photos (only ones we have rights to use) with the correct
   category, people count and water depth. Measure what Raahat gets right. One table in Notion beats any claim.
2. **Real user feedback:** show the control room to 2–3 people (an NDRF/SDRF volunteer, a civil-defence or NGO
   coordinator, anyone who has run a WhatsApp relief group). Quote them in Notion.
3. **Demo data:** a seed set that tells a story (a flood in one district: duplicates, corroborations, one fake,
   two without location) so the map looks alive on stage.
4. **Pitch and video:** 3-minute script, recorded backup video of the full flow, and the FAQ answers rehearsed.
   Keep the Notion page in sync with what is actually live.

## Shared files (change only after telling the team)

`src/lib/types.ts`, `src/lib/labels.ts`, `src/lib/constants.ts`, `package.json`, `package-lock.json`.
Adding a field to `Report` touches lanes 1–3, so post in the group first.

---

## How we work

**Setup (once per person)**
1. Arpit adds your GitHub username: repo → Settings → Collaborators → Add people. Accept the email invite.
2. `git clone https://github.com/CODARPIT/raahat-app.git && cd raahat-app && npm install`
3. `cp .env.example .env.local` and get the keys from Garv **privately** (never in the group chat, never committed).

**Every change**
1. Start from the latest main: `git checkout main && git pull`
2. Make a branch named after you: `git checkout -b arpan/offline-sending`
3. Before pushing: `npm test` and `npm run build` must both pass.
4. `git push -u origin arpan/offline-sending`, then open a pull request on GitHub.
5. Vercel builds a preview link for the PR. Check it on your phone.
6. One teammate looks at the PR, then merge. Merging to `main` updates https://raahat-kappa.vercel.app.

**Rules**
- **Never push straight to `main`.** It is the link the judges have. (Arpit: turn on Settings → Branches →
  "Require a pull request before merging" for `main`.)
- Small PRs, merged often. Pull `main` into your branch every day so conflicts stay small.
- No secrets in code, tests or screenshots. Test data uses fake values.
- **Demo freeze:** from the evening before judging, only bug fixes go to `main`, and only after the preview is checked.
