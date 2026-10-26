import { ImageResponse } from "next/og";

// The preview card shown when someone shares a Raahat link on WhatsApp, X or LinkedIn.
export const alt = "Raahat: citizen disaster photos, triaged by Cloudinary AI for control rooms";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BANDS = [
  { label: "Critical", color: "#b3122e" },
  { label: "High", color: "#c98200" },
  { label: "Moderate", color: "#3f7690" },
  { label: "Low", color: "#7c8b87" },
];

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#102a30", color: "#e9f1ef" }}>
        <div style={{ display: "flex", height: 14 }}>
          <div style={{ flex: 1, background: "#ff9933" }} />
          <div style={{ flex: 1, background: "#ffffff" }} />
          <div style={{ flex: 1, background: "#138808" }} />
        </div>
        <div style={{ display: "flex", flex: 1, padding: "60px 72px", gap: 64, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#ff9933", letterSpacing: 2 }}>RAAHAT</div>
            <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, marginTop: 18 }}>
              Every disaster photo, ranked for the people who can help.
            </div>
            <div style={{ fontSize: 28, marginTop: 26, opacity: 0.85 }}>
              Cloudinary AI triage · duplicates merged · faces pixelated · works on 2G and WhatsApp
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 120, border: "6px solid #e9f1ef", borderRadius: 6 }}>
            {BANDS.map((b, i) => (
              <div key={b.label} style={{ height: 96, background: b.color, borderTop: i ? "6px solid #e9f1ef" : "none" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
