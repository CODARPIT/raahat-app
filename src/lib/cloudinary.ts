// Server-side only: holds the API secret. Never import from a "use client" file.
import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.warn("[raahat] Cloudinary env vars missing. Copy .env.example to .env.local.");
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

export { REPORT_FOLDER } from "./constants";
export const creds = { cloudName: cloudName ?? "", apiKey: apiKey ?? "", apiSecret: apiSecret ?? "" };
export { cloudinary };
