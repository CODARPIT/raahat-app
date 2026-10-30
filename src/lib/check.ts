// "Is this viral photo real?" Shared by the /check page and the Telegram bot.
// The photo is uploaded only long enough for Cloudinary to compute its perceptual
// hash, then deleted; nothing about the person checking is kept.

import { cloudinary } from "./cloudinary";
import { SITE_URL } from "./constants";
import { matchPhoto } from "./reports";
import { factCheck, shortId, type Verdict } from "./verify";

const CHECK_FOLDER = "raahat/checks";

export interface CheckResult {
  knownOld: string | null;
  matches: { id: string; url: string; verdict: Verdict; category: string; createdAt: string }[];
}

export async function checkPhoto(dataUri: string): Promise<CheckResult> {
  const up = (await cloudinary.uploader.upload(dataUri, {
    folder: CHECK_FOLDER,
    resource_type: "image",
    phash: true,
    tags: ["raahat_check"],
  })) as { public_id: string; phash?: string };
  try {
    if (!up.phash) return { knownOld: null, matches: [] };
    const { knownOld, reports } = await matchPhoto(up.phash);
    return {
      knownOld,
      matches: reports.map((r) => ({
        id: shortId(r.publicId),
        url: `${SITE_URL}/v/${shortId(r.publicId)}`,
        verdict: factCheck(r).verdict,
        category: r.primaryCategory,
        createdAt: r.createdAt,
      })),
    };
  } finally {
    await cloudinary.uploader.destroy(up.public_id, { invalidate: true }).catch(() => undefined);
  }
}
