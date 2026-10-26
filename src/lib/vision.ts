// Cloudinary AI Vision (Analyze API) → structured findings.
// Two calls per report:
//   1. ai_vision_tagging  — our 10-category disaster taxonomy (deterministic labels)
//   2. ai_vision_general  — one JSON-answer prompt for people, water depth, authenticity, summaries
// If the add-on isn't enabled (or RAAHAT_AI_MODE=demo) we fall back to a transparent
// rule-based reading of the reporter's note, and the report is labelled "demo".

import { CATEGORIES, type Category, type VisionFindings, type WaterDepth } from "./types";

const TAG_DEFINITIONS: { name: Category; description: string }[] = [
  { name: "trapped_or_injured", description: "Does the image show a person who is trapped, stranded on a roof or in water, injured, or lying on the ground?" },
  { name: "crowd_crush", description: "Does the image show a dangerously packed crowd, a stampede, or people being crushed or trampled?" },
  { name: "medical_emergency", description: "Does the image show a person unconscious, collapsed, having a seizure, or receiving urgent medical aid such as CPR?" },
  { name: "fire", description: "Is there visible fire, flames or heavy smoke?" },
  { name: "gas_or_chemical_leak", description: "Does the image show a gas leak, a leaking cylinder or tanker, a chemical spill, toxic fumes, or people covering their faces from fumes?" },
  { name: "structural_collapse", description: "Does the image show a collapsed, cracked or badly damaged building, wall, bridge or roof?" },
  { name: "storm_damage", description: "Does the image show cyclone or storm damage, such as torn-off roofs, uprooted trees, flattened huts, or wreckage scattered by strong wind?" },
  { name: "landslide", description: "Does the image show a landslide, mudslide, or rocks and earth blocking an area?" },
  { name: "electrical_hazard", description: "Are there fallen electric poles, hanging or snapped power lines, or exposed wiring near water?" },
  { name: "flood", description: "Is a significant area flooded, with water covering roads, fields or entering homes?" },
  { name: "road_blocked", description: "Is a road or path blocked by a fallen tree, debris, vehicles or water so that vehicles cannot pass?" },
  { name: "relief_needed", description: "Does the image show people gathered waiting for food, water, medicine or shelter, or a relief camp?" },
  { name: "waterlogging", description: "Is there shallow standing water on a street (below knee height) without wider flooding?" },
  { name: "no_emergency", description: "Is this a normal everyday scene with no damage, hazard or emergency visible?" },
];

const JSON_PROMPT = `You are triaging a citizen photo for disaster responders in India. Reply with ONLY a JSON object, no prose, with exactly these keys:
{"is_real_photo": boolean (false if screenshot, meme, poster, drawing, AI-generated or photo of a screen),
 "is_disaster_related": boolean (true if it shows damage, a hazard, flooding, or people needing help),
 "people_visible": integer,
 "people_in_danger": boolean (anyone trapped, stranded, injured, unconscious, in a crowd crush, exposed to gas or fumes, in deep or fast water, or near a live wire),
 "water_depth": one of "none","ankle","knee","waist","chest_or_more","unknown" (judge against people, vehicles, doors),
 "access_blocked": boolean (can a rescue vehicle NOT reach this spot?),
 "summary": "one factual sentence for a rescue coordinator, under 25 words",
 "summary_hi": "the same sentence in simple Hindi (Devanagari)"}`;

type Mode = "live" | "demo" | "auto";

async function analyze(model: string, body: unknown) {
  const key = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!key || !secret || !cloud) throw new Error("Cloudinary credentials are not set.");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`https://api.cloudinary.com/v2/analysis/${cloud}/analyze/${model}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Vision ${model} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{ data?: { analysis?: Record<string, unknown> } }>;
}

/** Pull the first {...} block out of a model reply and parse it. */
export function parseJsonReply(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const DEPTHS: WaterDepth[] = ["none", "ankle", "knee", "waist", "chest_or_more", "unknown"];

export function findingsFromLive(tagNames: string[], json: Record<string, unknown> | null): VisionFindings {
  const categories = tagNames.filter((t): t is Category => (CATEGORIES as readonly string[]).includes(t));
  const j = json ?? {};
  const depth = DEPTHS.includes(j.water_depth as WaterDepth) ? (j.water_depth as WaterDepth) : "unknown";
  return {
    categories: categories.length ? categories : ["no_emergency"],
    isRealPhoto: j.is_real_photo !== false,
    isDisasterRelated: j.is_disaster_related !== false,
    peopleVisible: Number.isFinite(Number(j.people_visible)) ? Math.max(0, Math.round(Number(j.people_visible))) : 0,
    peopleInDanger: j.people_in_danger === true,
    waterDepth: depth,
    accessBlocked: j.access_blocked === true,
    summary: typeof j.summary === "string" ? j.summary : "Photo received; automatic summary unavailable.",
    summaryHi: typeof j.summary_hi === "string" ? j.summary_hi : "फ़ोटो मिली; स्वचालित सारांश उपलब्ध नहीं।",
    mode: "live",
  };
}

async function liveFindings(imageUrl: string): Promise<VisionFindings> {
  // Cloudinary tag names allow only lower-case letters, digits and hyphens,
  // and the tagging analyzer takes at most 10 definitions per call.
  const defs = TAG_DEFINITIONS.map((t) => ({ ...t, name: t.name.replace(/_/g, "-") }));
  const batches = [defs.slice(0, 10), defs.slice(10)].filter((b) => b.length);
  const [general, ...taggings] = await Promise.all([
    analyze("ai_vision_general", { source: { uri: imageUrl }, prompts: [JSON_PROMPT] }),
    ...batches.map((b) => analyze("ai_vision_tagging", { source: { uri: imageUrl }, tag_definitions: b })),
  ]);
  const tags = taggings.flatMap((t) => (t.data?.analysis?.tags as { name: string }[] | undefined) ?? []);
  const responses = (general.data?.analysis?.responses as { value: string }[] | undefined) ?? [];
  return findingsFromLive(
    tags.map((t) => t.name.replace(/-/g, "_")),
    parseJsonReply(responses[0]?.value ?? ""),
  );
}

// ── Demo fallback: rules over the reporter's own words (English + Hindi) ──────

const KEYWORDS: [Category, RegExp][] = [
  ["trapped_or_injured", /trapped|stuck|stranded|injur|hurt|bleed|roof|rescue|फंस|फँस|घायल|छत|बचाओ/i],
  ["crowd_crush", /stampede|crowd crush|crowd surge|trampl|भगदड़|भगदड/i],
  ["medical_emergency", /unconscious|fainted|faint|seizure|heart attack|not breathing|ambulance|doctor|बेहोश|दौरा|हार्ट अटैक|एम्बुलेंस|डॉक्टर/i],
  ["fire", /fire|smoke|burn|flame|आग|धुआ/i],
  ["gas_or_chemical_leak", /gas|leak|chemical|toxic|fumes|cylinder|ammonia|chlorine|गैस|रिसाव|ज़हरील|जहरील|सिलेंडर/i],
  ["structural_collapse", /collaps|crack|wall fell|building|bridge|गिर|दरार|मकान|पुल/i],
  ["storm_damage", /storm|cyclone|hurricane|gale|strong wind|uproot|hail|तूफ़ान|तूफान|चक्रवात|आंधी|आँधी/i],
  ["landslide", /landslide|mudslide|rocks|भूस्खलन|मलबा/i],
  ["electrical_hazard", /wire|pole|current|electric|shock|transformer|तार|करंट|बिजली|खंभा/i],
  ["flood", /flood|overflow|river|बाढ़|बाढ|नदी|डूब/i],
  ["road_blocked", /road|block|tree fell|fallen tree|सड़क|रास्ता|पेड़/i],
  ["relief_needed", /food|drinking water|medicine|hungry|shelter|camp|खाना|दवा|भूख|राशन/i],
  ["waterlogging", /waterlog|puddle|drain|जलभराव|नाली/i],
];

export function demoFindings(note: string): VisionFindings {
  const categories = KEYWORDS.filter(([, re]) => re.test(note)).map(([c]) => c);
  const depth: WaterDepth = /chest|neck|छाती|गले/i.test(note)
    ? "chest_or_more"
    : /waist|कमर/i.test(note)
      ? "waist"
      : /knee|घुटन/i.test(note)
        ? "knee"
        : /ankle|टखन/i.test(note)
          ? "ankle"
          : "unknown";
  const peopleMatch = note.match(/(\d{1,3})\s*(people|persons|log|लोग|बच्च|family|families)/i);
  const peopleVisible = peopleMatch ? Number(peopleMatch[1]) : /family|परिवार/i.test(note) ? 4 : 0;
  const cats = categories.length ? categories : (["no_emergency"] as Category[]);
  const trimmed = note.trim().slice(0, 140) || "Photo submitted without a description.";
  return {
    categories: cats,
    isRealPhoto: true,
    isDisasterRelated: cats[0] !== "no_emergency",
    peopleVisible,
    peopleInDanger:
      cats.includes("trapped_or_injured") ||
      cats.includes("crowd_crush") ||
      cats.includes("medical_emergency") ||
      (cats.includes("electrical_hazard") && cats.includes("flood")),
    waterDepth: depth,
    accessBlocked: cats.includes("road_blocked") || cats.includes("landslide") || depth === "waist" || depth === "chest_or_more",
    summary: `Reporter says: ${trimmed}`,
    summaryHi: `रिपोर्टर के अनुसार: ${trimmed}`,
    mode: "demo",
  };
}

export async function getFindings(imageUrl: string, note: string): Promise<VisionFindings> {
  const mode = (process.env.RAAHAT_AI_MODE ?? "auto") as Mode;
  if (mode === "demo") return demoFindings(note);
  try {
    return await liveFindings(imageUrl);
  } catch (err) {
    if (mode === "live") throw err;
    console.warn("[raahat] AI Vision unavailable, using demo triage:", (err as Error).message);
    return demoFindings(note);
  }
}
