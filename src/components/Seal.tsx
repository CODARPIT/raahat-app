// Raahat's seal: an original, official-style mark (not a government emblem).
// A navy ring carries the name in Devanagari and English; in the centre, the
// flood-gauge staff painted on Indian river bridges stands in rising water.

export function Seal({ size = 64, title = "Raahat seal", id = "seal" }: { size?: number; title?: string; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true} className="seal">
      <defs>
        {/* Top arc (clockwise, letters upright) and bottom arc (left to right underneath, so Hindi reads upright too). */}
        <path id={`${id}-top`} d="M18 60 A42 42 0 0 1 102 60" />
        <path id={`${id}-bottom`} d="M12.5 60 A47.5 47.5 0 0 0 107.5 60" />
        <clipPath id={`${id}-core`}>
          <circle cx="60" cy="60" r="31" />
        </clipPath>
      </defs>
      {/* Tricolour trim, navy ring */}
      <circle cx="60" cy="60" r="58" fill="#ff9933" />
      <circle cx="60" cy="60" r="56" fill="#ffffff" />
      <circle cx="60" cy="60" r="54" fill="#138808" />
      <circle cx="60" cy="60" r="52" fill="#0f2f4f" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="#e8b04a" strokeWidth="1.5" />
      <g fill="#ffffff" fontWeight="700" fontFamily="var(--font-mukta), sans-serif" textAnchor="middle">
        <text fontSize="13" letterSpacing="5">
          <textPath href={`#${id}-top`} startOffset="50%">RAAHAT</textPath>
        </text>
        <text fontSize="11.5">
          <textPath href={`#${id}-bottom`} startOffset="50%">राहत · आपदा सहायता</textPath>
        </text>
      </g>
      <g fill="#e8b04a" fontSize="10">
        <text x="10.5" y="64">✦</text>
        <text x="101" y="64">✦</text>
      </g>
      {/* Core: sky, gauge staff, water */}
      <g clipPath={`url(#${id}-core)`}>
        <rect x="20" y="20" width="80" height="80" fill="#f4f7f6" />
        <rect x="52" y="30" width="16" height="58" fill="#ffffff" stroke="#0f2f4f" strokeWidth="2" />
        <rect x="53" y="31" width="14" height="13" fill="#ffffff" />
        <rect x="53" y="45" width="14" height="13" fill="#c98200" />
        <rect x="53" y="59" width="14" height="13" fill="#b3122e" />
        <rect x="53" y="73" width="14" height="14" fill="#b3122e" />
        <path d="M53 44.5h14M53 58.5h14M53 72.5h14" stroke="#0f2f4f" strokeWidth="1.5" />
        <path d="M20 74 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 V100 H20z" fill="#2f6f9a" opacity="0.9" />
        <path d="M20 82 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 V100 H20z" fill="#1d4f73" />
      </g>
      <circle cx="60" cy="60" r="31" fill="none" stroke="#0f2f4f" strokeWidth="2" />
    </svg>
  );
}
