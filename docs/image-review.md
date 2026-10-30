# Delayed Gemini image assessment

Raahat returns its initial hazard rating first. For web, Telegram and WhatsApp images, a server-side Gemini assessment is scheduled to start **10 seconds after the rating is saved**. Completion takes additional time (4–9 s in testing with `gemini-3.5-flash`); it is not a ten-second response guarantee. The uploader's result screen and the board poll saved results every five seconds, with the existing Cloudinary Search cache/indexing delay.

## Configure locally or in Vercel

Set these server environment variables and restart the app:

```dotenv
GEMINI_API_KEY=<your Google AI Studio API key>
GEMINI_IMAGE_REVIEW_MODEL=gemini-3.5-flash
```

Keep the key server-side; never use a `NEXT_PUBLIC_` prefix. A Google AI Studio key works on the free tier without a billing account. Existing Cloudinary credentials are also required. Allow HTTPS to `generativelanguage.googleapis.com` and the existing Cloudinary API/delivery hosts in restricted environments. No additional database is used: the assessment is contextual metadata on the report's Cloudinary asset (`ir`, `ir_due`, `ir_at`, `ir_model`, `ir_why`, `ir_ok`, `ir_votes`).

`gemini-2.5-flash` is no longer offered to new API keys, and `gemini-3.8-flash` was returning "high demand" errors when this was built, so the default is `gemini-3.5-flash`. Change the model with `GEMINI_IMAGE_REVIEW_MODEL`; no code change is needed. `/api/health` does not call Gemini, so check a model with a real upload before a demo.

Without a Gemini key, the report is still filed and labelled **assessment unavailable**. Videos and command-line seed reports are **not assessed**. The Gemini request uses the stored uploaded image without auto-improve or sharpening; web uploads may already have been downscaled on the citizen's device. Images larger than 8 MiB or in unsupported formats (anything other than JPEG, PNG, WebP, HEIC, HEIF) return unavailable rather than being classified. The combined image download/model request has a 20-second timeout. There is no automatic paid retry.

## What the result means

- **Pending:** the image is waiting for or undergoing its second assessment. It remains available to responders. Its incident circle is drawn as provisional (finer dashes); it cannot add corroboration votes while pending.
- **No clear signs:** the model did not see clear signs of AI generation. This does not establish image authenticity or confirm the event. Normal compatible-report corroboration is now added.
- **Suspected synthetic:** the model named concrete visual concerns for human inspection. The original emergency score and status remain unchanged (no review reason is added, so the ×0.3 review multiplier does not apply). The image does not join an incident circle, cast corroboration votes or appear in the public report feed until a responder accepts its evidence. It is not automatically rejected or labelled fake.
- **Inconclusive / unavailable:** no reliable assessment was obtained. Neither state is evidence of fabrication, and neither creates a verified badge. Deferred corroboration is added as for "no clear signs".

Parsing is conservative: a blocked, truncated or malformed answer is *unavailable*, and a "suspected" answer without at least one concrete concern is *inconclusive*.

This calls Gemini's normal multimodal API. **It does not detect SynthID, validate C2PA, prove that an image is genuine or establish that a disaster happened.** A model can flag a genuine image or miss a synthetic one.

## Human decisions and privacy

The control room shows the assessment in its own panel, separate from the hazard score, with the model's concerns. **Accept image evidence after review** records an explicit human override (`image_accepted` in the audit trail) and restores incident eligibility if no other review reason excludes the report. It does not mark the incident verified, clear old-photo/other triage flags, or delete the model's original assessment. Repeated acceptance does not create additional corroboration votes. A later model concern temporarily suspends a prior public verified badge on `/v/<id>` until the image concern is accepted; the underlying responder status remains intact.

The web uploader receives a one-hour signed filing receipt (an HMAC over the report id and expiry, keyed with `RAAHAT_RECEIPT_SECRET` or, if unset, the Cloudinary API secret). `GET /api/reports/status` accepts that receipt in the `Authorization: Bearer` header, so the uploader can see the assessment even when a flagged report is no longer public. It returns the severity, score, category, status, duplicate flag, corroboration count and assessment state only: no exact location, note, contact hash, image URL or model explanation. Other public viewers never receive the model's explanation. The Gemini key is sent in the `x-goog-api-key` header, never in a URL, and never reaches the browser or Cloudinary metadata.

## Background execution limits

Next.js `after()` owns the delay and continues after the initial response, including if the uploader closes the page. Telegram and WhatsApp already process in `after()`; the check runs there after the citizen's reply. All three intake routes allow 120 seconds (`maxDuration`) for initial triage plus background work; the hosting plan must support that duration. This is not a durable task queue: instance termination, function limits or a failed metadata write can interrupt the job. An overdue pending assessment is presented as unavailable two minutes after its due time, and a late job then does nothing. It does not silently become successful. A production deployment needing guaranteed delivery should use a durable delayed-task queue with retries and a persistent idempotency key.

The due time is the job's idempotency key: a job whose report is no longer pending with that due time exits without calling the model. The worker re-reads the report after the Gemini call to preserve responder actions performed during assessment. Cloudinary does not provide an atomic compare-and-swap for these contextual updates; the repository's existing multi-instance write/cache limitations still apply.

## Validation

`tests/image-review.test.ts` covers scheduling, conservative parsing, original-upload input, server-only key transport, unsupported/oversized/failed/blocked/truncated/slow requests, stale and overdue jobs, signed receipts, unchanged hazard ratings, intervening responder actions, incident exclusion/restoration, the suspended public badge and explicit human overrides. Provider calls are mocked there. The live model was checked separately with a real key: `gemini-3.5-flash` returned "no clear signs" for two ordinary photos in 4–9 s.
