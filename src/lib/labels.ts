// Human-readable labels shared by the UI, the score breakdown and the alert card.
// Safe to import on client and server.

import type { Category, Channel, LocationSource, WaterDepth } from "./types";

export const CATEGORY_LABEL: Record<Category, string> = {
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

export const DEPTH_LABEL: Record<WaterDepth, string> = {
  none: "None",
  ankle: "Ankle",
  knee: "Knee",
  waist: "Waist",
  chest_or_more: "Chest or deeper",
  unknown: "Can't tell",
};

export const CHANNEL_LABEL: Record<Channel, string> = { web: "Web", whatsapp: "WhatsApp", telegram: "Telegram" };

export const LOCATION_SOURCE_LABEL: Record<LocationSource, string> = {
  gps: "Reporter's GPS",
  map_pin: "Reporter tapped the map",
  whatsapp_pin: "WhatsApp location pin",
  telegram_pin: "Telegram location pin",
  exif: "From the photo's GPS data",
  coordinator: "Pinned by the control room",
  missing: "No location yet",
};
