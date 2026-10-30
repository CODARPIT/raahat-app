import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The preview card shown when someone shares a Raahat Shield link on WhatsApp, X or LinkedIn.
export const alt = "Raahat Shield: prove a morphed photo is fake";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  // The same mark as the browser icon (src/app/icon.svg).
  const mark = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8");
  const markSrc = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2a1638", color: "#f6f2f9", padding: "64px 72px", gap: 56, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markSrc} width={280} height={280} alt="" />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#7fd1c9", letterSpacing: 6 }}>RAAHAT SHIELD</div>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.06, marginTop: 14 }}>
            A fake photo of you? Prove it, report it, stop it.
          </div>
          <div style={{ fontSize: 27, marginTop: 24, opacity: 0.85 }}>
            Private side-by-side proof that the face was copied from your photo, a police-ready evidence pack, and safer versions of your future posts.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
