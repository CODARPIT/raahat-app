# Delayed Gemini image assessment

Raahat returns its initial hazard rating first. For web, Telegram and WhatsApp images, a server-side Gemini assessment is scheduled to start **10 seconds after the rating is saved**. Completion takes additional time; it is not a ten-second response guarantee. The uploader's result screen and the board poll saved results every five seconds, with the existing Cloudinary Search cache/indexing delay.

## Configure locally or in Vercel

Set these server environment variables and restart the app:

```dotenv
GEMINI_API_KEY=<your Google AI Studio API key>
GEMINI_IMAGE_REVIEW_MODEL=gemini-2.5-flash
```

Keep the key server-side; never use a `NEXT_PUBLIC_` prefix. Existing Cloudinary credentials are also required. Allow HTTPS to `generativelanguage.googleapis.com` and the existing Cloudinary API/delivery hosts in restricted environments. No additional database is used: the assessment is contextual metadata on the report's Cloudinary asset.

Without a Gemini key, the report is still filed and labelled **assessment unavailable**. Videos and command-line seed reports are **not assessed** by this feature. The Gemini request uses the stored uploaded image without auto-improve or sharpening; web uploads may already have been downscaled on the citizen's device. Images larger than 8 MiB or in unsupported formats return unavailable rather than being classified. The combined image download/model request has a 20-second timeout. There is no automatic paid retry.

## What the result means

- **Pending:** the image is waiting for or undergoing its second assessment. It remains available to responders. Its circle is provisional; it cannot add corroboration votes while pending.
- **No clear signs:** the model did not see clear signs of AI generation. This does not establish image authenticity or confirm the event. Normal compatible-report corroboration can now be added.
- **Suspected synthetic:** concrete visual concerns were raised for human inspection. The original emergency score and status remain unchanged. The image does not participate in an incident circle or the public report feed until a responder accepts its evidence. It is not automatically rejected or labelled fake.
- **Inconclusive / unavailable:** no reliable assessment was obtained. Neither state is evidence of fabrication, and neither creates a verified badge.

This calls Gemini's normal multimodal API. **It does not detect SynthID, validate C2PA, prove that an image is genuine or establish that a disaster happened.** A model can flag a genuine image or miss a synthetic one.

## Human decisions and privacy

The control room shows the assessment separately from the hazard score. “Accept image evidence after review” records an explicit human override and restores incident eligibility if no other review reason excludes the report. It does not mark the incident verified, clear old-photo/other triage flags, or delete the model's original assessment. Repeated acceptance does not create additional corroboration votes. A later model concern temporarily suspends a prior public verified badge until the image concern is accepted; the underlying responder status remains intact.

The uploader receives a one-hour signed filing receipt. A minimal status endpoint accepts that receipt in the Authorization header, so the uploader can see the assessment even when a flagged report is no longer public. It returns no exact location, note, contact hash or image URL. Other public viewers do not receive the model's explanation. The Gemini key never reaches the browser or Cloudinary metadata.

## Background execution limits

Next.js `after()` owns the delay and continues after the initial response, including if the uploader closes the page. All three intake routes allow 120 seconds for initial triage plus background work; the hosting plan must support that duration. This is not a durable task queue: instance termination, function limits or a failed metadata write can interrupt the job. An overdue pending assessment is presented as unavailable after two minutes beyond its due time. It does not silently become successful. A production deployment needing guaranteed delivery should use a durable delayed-task queue with retries and a persistent idempotency key.

The worker re-reads the report after the Gemini call to preserve responder actions performed during assessment. Cloudinary does not provide an atomic compare-and-swap for these contextual updates; the repository's existing multi-instance write/cache limitations still apply.

## Validation

`tests/image-review.test.ts` covers scheduling, conservative parsing, original-upload input, server-only key transport, failed/blocked/truncated requests, stale jobs, signed receipts, unchanged hazard ratings, intervening responder actions, incident exclusion/restoration and explicit human overrides. Provider calls are mocked; a configured key and live upload are required to validate Google's current model availability and responses.
