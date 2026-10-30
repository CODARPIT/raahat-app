"use client";

// Protect future photos: a tiled watermark across the body area (where a morph would
// cut and paste), the long side cut to 1080 px, and every bit of metadata dropped
// (a canvas export carries no EXIF or GPS). Runs on this device for now; the Cloudinary
// version (l_text + fl_tiled, c_limit) will also register each photo's fingerprint.

import { useEffect, useRef, useState } from "react";

const MAX_SIDE = 1080;
const STRENGTH = { light: 0.14, medium: 0.24, strong: 0.38 } as const;
type Strength = keyof typeof STRENGTH;

async function protect(file: File, mark: string, strength: Strength): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const size = Math.max(18, Math.round(w / 22));
  ctx.save();
  ctx.globalAlpha = STRENGTH[strength];
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const text = `${mark}  ·  `;
  const step = ctx.measureText(text).width;
  const reach = Math.hypot(w, h);
  for (let y = -reach / 2; y < reach / 2; y += size * 3.2) {
    for (let x = -reach / 2 - ((y / (size * 3.2)) % 2) * step / 2; x < reach / 2; x += step) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.82));
}

interface Item {
  name: string;
  before: number;
  after: number;
  url: string;
}

export function ProtectTool() {
  const [mark, setMark] = useState("@myhandle · do not reuse");
  const [strength, setStrength] = useState<Strength>("medium");
  const [sources, setSources] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const made = await Promise.all(
        sources.map(async (f) => {
          const blob = await protect(f, mark.trim() || "do not reuse", strength);
          return { name: f.name.replace(/\.[^.]+$/, "") + "-protected.jpg", before: f.size, after: blob.size, url: URL.createObjectURL(blob) };
        }),
      );
      if (!live) return made.forEach((m) => URL.revokeObjectURL(m.url));
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = made.map((m) => m.url);
      setItems(made);
    })();
    return () => {
      live = false;
    };
  }, [sources, mark, strength]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return (
    <main className="case">
      <div className="case-head">
        <div>
          <p className="kicker">Before you post</p>
          <h1>Protect my photos</h1>
          <p className="lead">
            Watermarked, smaller copies are harder to morph convincingly and easier to trace. They do not make misuse impossible,
            so keep your account private where you can.
          </p>
        </div>
      </div>

      <section className="panel protect-grid" aria-label="Settings">
        <div className="form-grid">
          <label className="span-2">
            Watermark text
            <input type="text" value={mark} maxLength={40} onChange={(e) => setMark(e.target.value)} />
          </label>
          <fieldset className="span-2 segmented">
            <legend>Strength</legend>
            {(Object.keys(STRENGTH) as Strength[]).map((s) => (
              <label key={s}>
                <input type="radio" name="strength" checked={strength === s} onChange={() => setStrength(s)} />
                <span>{s[0].toUpperCase() + s.slice(1)}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <ul className="checks">
          <li>Tiled watermark across the whole photo</li>
          <li>Long side reduced to {MAX_SIDE} px</li>
          <li>Location and camera details removed</li>
        </ul>
      </section>

      <section className="panel">
        <label htmlFor="protect-files" className="dropzone">
          <input id="protect-files" type="file" accept="image/*" multiple onChange={(e) => { setSources(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <span className="dropzone-icon" aria-hidden>＋</span>
          <span className="dropzone-label">Choose photos to protect</span>
          <span className="dropzone-hint">They are processed on this device and never uploaded.</span>
        </label>

        {items.length > 0 && (
          <ul className="protected-list">
            {items.map((it) => (
              <li key={it.url}>
                <img src={it.url} alt={`Protected version of ${it.name}`} />
                <div>
                  <span className="num">{Math.round(it.before / 1024)} KB → {Math.round(it.after / 1024)} KB</span>
                  <a className="btn btn-small btn-primary" href={it.url} download={it.name}>Download</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
