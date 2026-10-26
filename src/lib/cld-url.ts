// Cloudinary delivery URLs. Every pixel Raahat shows is a transformation of the
// one original upload, generated on the CDN edge the first time it's requested.
// Safe to import on client and server.

import type { Report, Severity } from "./types";

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "demo";

/** Privacy layer applied to everything outside the responder console. */
export const PRIVACY = "e_pixelate_faces:18";

function base(resourceType: "image" | "video") {
  return `https://res.cloudinary.com/${CLOUD}/${resourceType}/upload`;
}

/** Videos are represented by a frame two seconds in, so the same image pipeline applies. */
function still(publicId: string, resourceType: "image" | "video", chain: string[]) {
  if (resourceType === "video") {
    return `${base("video")}/so_2/${chain.join("/")}/${publicId}.jpg`;
  }
  return `${base("image")}/${chain.join("/")}/${publicId}`;
}

export type Bandwidth = "normal" | "saver";

/**
 * Queue thumbnail. g_auto smart-crops onto the subject (the collapsed wall, not the sky);
 * q_auto:low / q_auto:eco plus f_auto keeps it to a few KB for 2G control rooms.
 */
export function thumbUrl(r: Pick<Report, "publicId" | "resourceType">, bw: Bandwidth = "normal", blur = true) {
  const size = bw === "saver" ? "w_160,h_120" : "w_320,h_240";
  const q = bw === "saver" ? "q_auto:low" : "q_auto:eco";
  const chain = [...(blur ? [PRIVACY] : []), `c_fill,g_auto,${size}`, `f_auto,${q}`];
  return still(r.publicId, r.resourceType, chain);
}

/** Detail view for responders: auto-improve exposure/contrast for night and rain photos. */
export function enhancedUrl(r: Pick<Report, "publicId" | "resourceType">, blur: boolean) {
  const chain = [...(blur ? [PRIVACY] : []), "e_improve:outdoor", "e_sharpen:60", "c_limit,w_1200", "f_auto,q_auto"];
  return still(r.publicId, r.resourceType, chain);
}

/** The unmodified upload, for responders who need to read a house number. */
export function originalUrl(r: Pick<Report, "publicId" | "resourceType">) {
  return r.resourceType === "video"
    ? `${base("video")}/${r.publicId}`
    : `${base("image")}/${r.publicId}`;
}

/** Four-second preview clip so a coordinator on a weak link never streams the whole video. */
export function videoPreviewUrl(publicId: string) {
  return `${base("video")}/${PRIVACY.replace("pixelate_faces", "blur_faces")}/e_preview:duration_4/c_limit,w_640/q_auto:low/${publicId}.mp4`;
}

/** Image the AI looks at: downscaled (fewer tokens) and auto-improved (dark flood photos). */
export function analysisUrl(publicId: string, resourceType: "image" | "video") {
  return still(publicId, resourceType, ["e_improve:outdoor", "c_limit,w_1024", "q_auto:good"]);
}

// ── Alert card ───────────────────────────────────────────────────────────────

/** Text overlays need commas and slashes double-escaped. */
export function encodeOverlayText(text: string) {
  return encodeURIComponent(text).replace(/%2C/g, "%252C").replace(/%2F/g, "%252F");
}

export const SEVERITY_HEX: Record<Severity, string> = {
  critical: "B3122E",
  high: "D98E04",
  moderate: "2C6E6A",
  low: "6E7F7A",
};

export const CATEGORY_LABEL: Record<string, string> = {
  trapped_or_injured: "People trapped or injured",
  crowd_crush: "Crowd crush or stampede",
  medical_emergency: "Medical emergency",
  fire: "Fire",
  gas_or_chemical_leak: "Gas or chemical leak",
  structural_collapse: "Building damage",
  storm_damage: "Storm or cyclone damage",
  landslide: "Landslide",
  electrical_hazard: "Live wire or electrical hazard",
  flood: "Flooding",
  road_blocked: "Road blocked",
  relief_needed: "Food, water or shelter needed",
  waterlogging: "Waterlogging",
  no_emergency: "No emergency seen",
};

/**
 * A square, WhatsApp-ready alert built entirely by URL: faces pixelated, subject
 * smart-cropped, severity banner and summary composited as text layers.
 */
export function alertCardUrl(r: Report) {
  const headline = `${r.severity.toUpperCase()}  ${CATEGORY_LABEL[r.primaryCategory] ?? ""}`;
  const where = `${r.lat.toFixed(3)} N  ${r.lng.toFixed(3)} E   Raahat priority ${r.score}`;
  const summary = r.summary.length > 140 ? r.summary.slice(0, 137) + "..." : r.summary;
  const chain = [
    PRIVACY,
    "c_fill,g_auto,w_1080,h_1080",
    "e_brightness:-10",
    `l_text:Arial_58_bold:${encodeOverlayText(headline)},co_white,b_rgb:${SEVERITY_HEX[r.severity]},g_north_west,x_0,y_0,w_1080,c_fit`,
    `l_text:Arial_40:${encodeOverlayText(summary)},co_white,b_rgb:000000b3,w_1000,c_fit,g_south_west,x_40,y_110`,
    `l_text:Arial_30_bold:${encodeOverlayText(where)},co_rgb:FFE9A8,b_rgb:000000b3,g_south_west,x_40,y_40`,
    "f_jpg,q_auto",
  ];
  return still(r.publicId, r.resourceType, chain);
}
