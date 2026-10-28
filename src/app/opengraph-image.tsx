import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The preview card shown when someone shares a Raahat link on WhatsApp, X or LinkedIn.
export const alt = "Raahat: citizen disaster reporting and triage portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  // The same seal as the browser icon (src/app/icon.svg).
  const seal = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8");
  const sealSrc = `data:image/svg+xml;base64,${Buffer.from(seal).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0f2f4f", color: "#eef3f8" }}>
        <div style={{ display: "flex", height: 14 }}>
          <div style={{ flex: 1, background: "#ff9933" }} />
          <div style={{ flex: 1, background: "#ffffff" }} />
          <div style={{ flex: 1, background: "#138808" }} />
        </div>
        <div style={{ display: "flex", flex: 1, padding: "56px 72px", gap: 56, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sealSrc} width={300} height={300} alt="" />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#ff9933", letterSpacing: 6 }}>RAAHAT</div>
            <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.06, marginTop: 14 }}>
              Citizen Disaster Reporting &amp; Triage Portal
            </div>
            <div style={{ fontSize: 27, marginTop: 24, opacity: 0.85 }}>
              One photo from a citizen, ranked by Cloudinary AI for the control room. Duplicates merged, faces pixelated, works on 2G and WhatsApp.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", height: 8, background: "#138808" }} />
      </div>
    ),
    size,
  );
}
