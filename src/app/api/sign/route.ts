// Signs Upload Widget requests so the API secret never reaches the browser,
// and refuses to sign anything that isn't a Raahat report upload.

import { NextResponse } from "next/server";
import { cloudinary, creds } from "@/lib/cloudinary";
import { REPORT_FOLDER, REPORT_TAG } from "@/lib/constants";

export async function POST(req: Request) {
  const { paramsToSign } = (await req.json()) as { paramsToSign: Record<string, string | number> };
  if (paramsToSign.folder !== REPORT_FOLDER || !String(paramsToSign.tags ?? "").includes(REPORT_TAG)) {
    return NextResponse.json({ error: "Only Raahat report uploads can be signed." }, { status: 400 });
  }
  const signature = cloudinary.utils.api_sign_request(paramsToSign, creds.apiSecret);
  return NextResponse.json({ signature });
}
