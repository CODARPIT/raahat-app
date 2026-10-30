# Raahat Shield

**Private help for women being blackmailed with morphed photos: prove the image is fake, build a police-ready evidence pack, and protect future photos.**

**Live demo:** https://raahat-kappa.vercel.app · [prove it's fake](https://raahat-kappa.vercel.app/case) · [protect my photos](https://raahat-kappa.vercel.app/protect) · [get help now](https://raahat-kappa.vercel.app/help)

A girl's Instagram photos are taken and morphed into obscene images, and the blackmailer demands money. She panics
and pays, or stays silent out of stigma; she has no way to show the image is fake, and police need evidence in a
form she doesn't know how to assemble. Cybercrime cases in India rose 31.2% in a year, from 65,893 in 2022 to
86,420 in 2023 (NCRB), and the National Commission for Women has asked for "deepfake abuse" to be made a specific crime.

Built for **Hacktober HackDays 2026** (SheBuilds Delhi × MLH), Tech for Social Good track. Project documents are in [`docs/`](docs/).

## What it does

1. **Prove it's fake.** She privately adds the morphed image and her original photo. Cloudinary finds and crops the
   face in both; the perceptual hashes of the two face crops show the face was copied from *that* photo, and a proof
   card shows them side by side.
2. **Evidence pack.** SHA-256 fingerprints and timestamps of every file, a complaint ready for
   [cybercrime.gov.in](https://cybercrime.gov.in), takedown requests citing IT Rules 2021 Rule 3(2)(b), and one ZIP.
3. **Protect future photos.** Watermarked, 1080 px copies with location and camera details removed.

## How it fits the government process

India's NCII procedure (MeitY, October 2025) makes platforms remove morphed intimate images within 24 hours of a
valid complaint and share hashes to stop re-uploads. Raahat Shield is the step before it: it works while the
threat is still in private messages, saves the evidence *before* anything is taken down, gives her proof she can
show family or college, and hands her a complete complaint for 1930 / cybercrime.gov.in.

## Privacy

- Nothing is published. Case files are uploaded as `authenticated` assets and shown through signed URLs.
- No account: a case is a random ID in an httpOnly cookie. No name, phone or email.
- The fake image is blurred on every screen until she chooses to look.
- **Delete my case** removes every asset and purges CDN copies; forgotten cases are deleted after 72 hours.
- **Quick exit** (button, or Esc twice) leaves for a neutral page.

## Cloudinary features used

| Feature | Why |
|---|---|
| `type: authenticated` uploads + signed URLs | Case images are never publicly reachable |
| Upload option `faces: true`, `g_face` | Face boxes in both images |
| `c_crop,g_face` face-crop assets | Same-size face crops to compare |
| `phash: true` | Perceptual fingerprints: "the face came from this photo" |
| `image_metadata: true` | EXIF dates for the timeline |
| `e_blur` (+ optional Rekognition moderation) | The fake is never shown unblurred by default |
| Overlays `l_<id>`, `l_text`, `c_pad` | Proof card built from one URL |
| `l_text` + `fl_tiled`, `c_limit`, `q_auto` | Watermarked, smaller copies of future photos |
| Archive API `download_zip_url` with `expires_at` | One expiring ZIP of the evidence |
| `delete_resources_by_tag` + `invalidate` | Delete my case, including CDN copies |
| Tags + contextual metadata + Search API | The case lives on its assets; no separate database |

## Run it

```bash
cp .env.example .env.local     # fill in your Cloudinary keys
npm install
npm run dev                    # http://localhost:3000
npm test
```

## Team

| Person | Lane |
|---|---|
| Arpit | Face matching: similarity score, keypoints, editing indicators |
| Arpan | Frontend and UX |
| Garv | Cloudinary, API and deployment |
| Aviraj | Evidence pack, legal text, docs and pitch |

## Status and honest limits

- Done: new site, case page (side-by-side, SHA-256 fingerprints, complaint and takedown text), protect page (on device).
- In progress: Cloudinary uploads, face crops and pHash match, proof card, evidence ZIP, delete and 72 h cleanup.
- A match proves the face was copied from her photo; it cannot prove who made the morph. Courts may still need a
  certified forensic report; the pack is a starting point that saves police time.
- Watermarks make misuse harder and traceable, not impossible.
- The law sections in the complaint are suggestions; the police decide which apply.

## Earlier version

Raahat started as a disaster-photo triage portal (citizen reports ranked by Cloudinary AI for control rooms).
That code is still in the repo (`/report`, `/map`, `/respond`, `/check`, `src/lib/triage.ts`) but is no longer linked from the site.
