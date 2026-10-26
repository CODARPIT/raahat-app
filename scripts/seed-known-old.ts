// Build the "known old photos" library: famous disaster photos that keep being
// re-shared as if new. Any new report whose perceptual hash matches one of them is
// sent to human review with the reason "Matches an older photo: <caption>".
//
// 1. cp scripts/known-old.example.json scripts/known-old.json
// 2. Point each "file" (or "url") at a photo you have the right to use, with a caption
//    saying where and when it is really from, e.g. "Bihar floods, August 2017".
// 3. npm run seed:known-old
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

interface Item {
  file?: string;
  url?: string;
  caption: string;
}

async function main() {
  const { cloudinary } = await import("../src/lib/cloudinary");
  const { KNOWN_OLD_TAG } = await import("../src/lib/reports");

  const items = JSON.parse(readFileSync(process.argv[2] ?? "scripts/known-old.json", "utf8")) as Item[];
  for (const item of items) {
    const source = item.file ?? item.url;
    if (!source || !item.caption) continue;
    const up = await cloudinary.uploader.upload(source, { folder: "raahat/known_old", tags: [KNOWN_OLD_TAG], resource_type: "image" });
    const res = (await cloudinary.api.resource(up.public_id, { phash: true })) as { phash?: string };
    if (!res.phash) {
      console.warn(`no perceptual hash for ${source}; skipped`);
      continue;
    }
    await cloudinary.api.update(up.public_id, { context: { phash: res.phash, caption: item.caption.slice(0, 120) } } as Record<string, unknown>);
    console.log(`${res.phash}  ${item.caption}  (${source})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
