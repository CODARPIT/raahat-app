// The Raahat Shield mark: a shield with a face outline and a check, the promise in one
// shape — "we can show this face was copied". Same drawing as src/app/icon.svg.
export function ShieldMark({ size = 44, title = "Raahat Shield" }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className="shield-mark">
      {title && <title>{title}</title>}
      <path d="M24 3 L42 9 V23 C42 34 34 42 24 45 C14 42 6 34 6 23 V9 Z" fill="var(--brand)" />
      <path d="M24 7.5 L38 12.2 V23 C38 31.8 31.8 38.3 24 40.8 C16.2 38.3 10 31.8 10 23 V12.2 Z" fill="none" stroke="var(--brand-soft)" strokeWidth="1.5" />
      <circle cx="24" cy="20" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M14.5 34 C16.5 28.8 20 27 24 27 C28 27 31.5 28.8 33.5 34" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="35" cy="35" r="7" fill="var(--accent)" stroke="var(--brand)" strokeWidth="2" />
      <path d="M31.8 35.2 l2.2 2.2 l4.2 -4.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
