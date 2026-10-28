"use client";

import { useEffect, useState } from "react";

/** Copy / share buttons for a fact-check page. Native share sheet on phones, links elsewhere. */
export function ShareBar({ url, text, cardUrl }: { url: string; text: string; cardUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false); // known only in the browser
  useEffect(() => setCanShare("share" in navigator), []);
  const enc = encodeURIComponent;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  const share = () => navigator.share?.({ title: "Raahat fact check", text, url }).catch(() => undefined);
  return (
    <div className="share-bar">
      {canShare && (
        <button type="button" className="btn btn-primary" onClick={share}>Share</button>
      )}
      <button type="button" className="btn" onClick={copy} aria-live="polite">{copied ? "Link copied" : "Copy link"}</button>
      <a className="btn" href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noreferrer">Telegram</a>
      <a className="btn" href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className="btn" href={`https://x.com/intent/post?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noreferrer">X</a>
      {cardUrl && <a className="btn" href={cardUrl}>Download Instagram card</a>}
    </div>
  );
}
