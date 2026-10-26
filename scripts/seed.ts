// Seed demo reports through the real pipeline (upload → AI Vision → dedupe → save).
// 1. cp scripts/seed.example.json scripts/seed.json and point "file" at your own photos
//    (or "url" at images you have the right to use).
// 2. npm run seed
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

interface SeedItem {
  file?: string;
  url?: string;
  lat: number;
  lng: number;
  note: string;
  lang?: "en" | "hi";
}

async function main() {
  const { cloudinary } = await import("../src/lib/cloudinary");
  const { REPORT_FOLDER, REPORT_TAG } = await import("../src/lib/constants");
  const { triage } = await import("../src/lib/reports");

  const items = JSON.parse(readFileSync(process.argv[2] ?? "scripts/seed.json", "utf8")) as SeedItem[];
  for (const item of items) {
    const source = item.file ?? item.url;
    if (!source) continue;
    const up = await cloudinary.uploader.upload(source, {
      folder: REPORT_FOLDER,
      tags: [REPORT_TAG],
      resource_type: "auto",
    });
    const report = await triage({
      publicId: up.public_id,
      resourceType: up.resource_type === "video" ? "video" : "image",
      lat: item.lat,
      lng: item.lng,
      note: item.note,
      lang: item.lang ?? "en",
    });
    console.log(
      `${report.severity.padEnd(8)} ${String(report.score).padStart(3)}  ${report.primaryCategory.padEnd(20)} ` +
        `${report.duplicateOf ? "duplicate " : ""}${report.aiMode}  ${source}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
