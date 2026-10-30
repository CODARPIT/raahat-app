// Delayed second look at a report's image: does it show signs of AI generation?
// The hazard rating is filed first; this assessment is scheduled 10 s after it is
// saved and runs on Gemini's normal multimodal API (see docs/image-review.md).
//
// It does not detect SynthID or validate C2PA, and it cannot prove an image genuine.
// A "suspected" result only asks a human to look: it never changes the emergency
// score or status. Parsing is conservative: anything short of a clear, well-formed
// answer becomes "inconclusive" or "unavailable", never "suspected".

import type { Report } from "./types";

export type ImageReviewState = "pending" | "clear" | "suspected" | "inconclusive" | "unavailable" | "not_assessed";

export interface ImageReview {
  state: ImageReviewState;
  /** Pending only: when the assessment is due to start. Also the job's idempotency key. */
  dueAt: string | null;
  /** When the model answered or the attempt ended. */
  at: string | null;
  model: string | null;
  /** The model's concrete visual concerns. Responders only, never public. */
  concerns: string[];
  /** A responder accepted the image as evidence after looking at the concerns. */
  acceptedAt: string | null;
  /** This report has already cast its corroboration votes for nearby reports. */
  votesAdded: boolean;
}

export const REVIEW_DELAY_MS = 10_000;
export const REVIEW_TIMEOUT_MS = 20_000; // image download + model call together
/** A pending assessment this long past its due time is shown as unavailable. */
export const REVIEW_GRACE_MS = 2 * 60_000;
export const MAX_REVIEW_BYTES = 8 * 1024 * 1024;
export const REVIEW_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_CONCERNS = 5;

export const reviewEnabled = () => Boolean(process.env.GEMINI_API_KEY);
export const reviewModel = () => process.env.GEMINI_IMAGE_REVIEW_MODEL || "gemini-3.5-flash";

export const NOT_ASSESSED: ImageReview = {
  state: "not_assessed",
  dueAt: null,
  at: null,
  model: null,
  concerns: [],
  acceptedAt: null,
  votesAdded: true,
};

/** The state a fresh report starts in. Videos and seed reports are not assessed. */
export function initialReview(resourceType: "image" | "video", assess: boolean, now = new Date()): ImageReview {
  if (!assess || resourceType !== "image") return NOT_ASSESSED;
  if (!reviewEnabled()) return { ...NOT_ASSESSED, state: "unavailable", at: now.toISOString() };
  return { ...NOT_ASSESSED, state: "pending", dueAt: new Date(now.getTime() + REVIEW_DELAY_MS).toISOString(), votesAdded: false };
}

/** An overdue pending job (instance stopped, function limit hit) reads as unavailable, never as success. */
export function effectiveReview(review: ImageReview, now = new Date()): ImageReview {
  if (review.state !== "pending" || !review.dueAt) return review;
  return now.getTime() > Date.parse(review.dueAt) + REVIEW_GRACE_MS ? { ...review, state: "unavailable" } : review;
}

/** Suspected and not yet accepted by a responder: kept out of incidents, votes and the public feed. */
export function imageConcern(r: Partial<Pick<Report, "imageReview">>): boolean {
  return r.imageReview?.state === "suspected" && !r.imageReview.acceptedAt;
}

/** Still waiting for its second look: its circle is provisional and it can't vote yet. */
export function reviewPending(r: Partial<Pick<Report, "imageReview">>): boolean {
  return r.imageReview?.state === "pending";
}

// ── Gemini ───────────────────────────────────────────────────────────────────

export const REVIEW_PROMPT = `You are helping disaster responders in India decide whether a citizen's photo needs a closer human look.
Judge ONLY whether the image shows concrete visual signs of being generated or substantially altered by AI.
Do not judge whether the disaster is real, how severe it is, where it is, or whether the photo is old.
Blur, darkness, rain, motion, low resolution, compression, screenshots, filters and cropping are NOT signs of AI generation.
Answer "suspected_synthetic" only if you can name specific visible problems, such as malformed hands or faces,
garbled or melting text and signage, impossible geometry or perspective, inconsistent shadows or reflections,
objects merging into each other, or repeated textures. Say where in the image each problem is.
Answer "no_clear_signs" if you see none. Answer "inconclusive" if you cannot tell.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["no_clear_signs", "suspected_synthetic", "inconclusive"] },
    concerns: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["verdict", "concerns"],
};

export interface Assessment {
  state: Extract<ImageReviewState, "clear" | "suspected" | "inconclusive" | "unavailable">;
  concerns: string[];
  model: string;
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

/** Model output → state. Blocked, truncated or malformed answers are "unavailable"; a suspicion without concrete concerns is "inconclusive". */
export function parseAssessment(json: unknown): Pick<Assessment, "state" | "concerns"> {
  const unavailable = { state: "unavailable" as const, concerns: [] };
  const res = json as GeminiResponse | null;
  if (!res || res.promptFeedback?.blockReason) return unavailable;
  const candidate = res.candidates?.[0];
  if (!candidate || candidate.finishReason !== "STOP") return unavailable;
  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  let answer: { verdict?: unknown; concerns?: unknown };
  try {
    answer = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return unavailable;
  }
  const concerns = Array.isArray(answer?.concerns)
    ? answer.concerns
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.replace(/\s+/g, " ").trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, MAX_CONCERNS)
    : [];
  switch (answer?.verdict) {
    case "no_clear_signs":
      return { state: "clear", concerns: [] };
    case "suspected_synthetic":
      return concerns.length ? { state: "suspected", concerns } : { state: "inconclusive", concerns: [] };
    case "inconclusive":
      return { state: "inconclusive", concerns: [] };
    default:
      return unavailable;
  }
}

export interface AssessOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) return null;
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Downloads the stored original (no auto-improve or sharpening) and asks Gemini about it.
 * One 20 s budget covers both steps. Never throws and never retries: any failure is "unavailable".
 */
export async function assessImage(imageUrl: string, opts: AssessOptions = {}): Promise<Assessment> {
  const model = opts.model ?? reviewModel();
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const unavailable: Assessment = { state: "unavailable", concerns: [], model };
  if (!apiKey) return unavailable;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REVIEW_TIMEOUT_MS);
  try {
    const img = await fetchImpl(imageUrl, { signal: ctrl.signal });
    const mime = (img.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!img.ok || !REVIEW_MIME_TYPES.includes(mime)) return unavailable;
    const bytes = await readCapped(img, MAX_REVIEW_BYTES);
    if (!bytes) return unavailable;

    // The key travels in a header, never in the URL, so it can't leak into logs.
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: REVIEW_PROMPT }, { inline_data: { mime_type: mime, data: bytes.toString("base64") } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    });
    if (!res.ok) {
      console.warn(`[raahat] Gemini image review failed: HTTP ${res.status}`);
      return unavailable;
    }
    return { ...parseAssessment(await res.json()), model };
  } catch (err) {
    console.warn("[raahat] Gemini image review unavailable:", ctrl.signal.aborted ? "timed out" : (err as Error).message);
    return unavailable;
  } finally {
    clearTimeout(timer);
  }
}
