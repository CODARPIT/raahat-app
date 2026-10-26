// Place hints for reports that arrive without a location. "Help, near Gandhi School"
// isn't enough to send a boat, but it tells the coordinator where to look first.
// The hint is only ever a suggestion: a human confirms every pin.

// Words that end a place phrase: "near the school where water is rising" → "school".
const STOP = /^(and|with|where|which|who|water|is|are|was|has|have|had|people|families|family|please|help|but|so|we|they|i|our|my|\d+)$/i;

function trimPhrase(phrase: string, maxWords = 4): string {
  const out: string[] = [];
  for (const w of phrase.trim().split(/\s+/)) {
    if (STOP.test(w) || out.length >= maxWords) break;
    out.push(w);
  }
  return out.join(" ");
}

export function placesFromNote(note: string): string[] {
  const found: string[] = [];
  // English: "near / opposite / behind / next to / beside … <place>"
  for (const m of note.matchAll(/\b(?:near|opposite|behind|next to|beside|in front of|outside)\s+(?:the\s+)?([^,.;:!?()\n]{2,60})/gi)) {
    const p = trimPhrase(m[1]);
    if (p) found.push(p);
  }
  // English: "in Patna", "at Rampur Ghat" (capitalised only, so "in water" doesn't count)
  for (const m of note.matchAll(/\b(?:in|at)\s+((?:[A-Z][\p{L}]+)(?:\s+[A-Z][\p{L}]+){0,3})/gu)) found.push(m[1]);
  // Capitalised multi-word names anywhere: "Gandhi Nagar", "Ram Mandir Road"
  for (const m of note.matchAll(/\b([A-Z][\p{Ll}]+(?:\s+[A-Z][\p{Ll}]+)+)\b/gu)) found.push(m[1]);
  // Hindi: "<place> के पास / के सामने / के पीछे / की तरफ़"
  for (const m of note.matchAll(/((?:[\p{L}\p{M}]+\s+)?[\p{L}\p{M}]+)\s+(?:के|की)\s+(?:पास|सामने|पीछे|बगल|तरफ़|तरफ)/gu)) found.push(m[1]);
  return [...new Set(found)];
}

/** Merge place names from the note, the reporter's own description and the photo, without repeats. */
export function placeHint(note: string, described = "", fromPhoto: string[] = []): string {
  const all = [described.trim(), ...placesFromNote(note), ...fromPhoto.map((p) => p.trim())].filter((p) => p.length >= 2);
  const kept: string[] = [];
  for (const p of all) {
    const low = p.toLowerCase();
    if (kept.some((k) => k.toLowerCase().includes(low))) continue;
    for (let i = kept.length - 1; i >= 0; i--) if (low.includes(kept[i].toLowerCase())) kept.splice(i, 1);
    kept.push(p);
  }
  return kept.join(", ").slice(0, 200);
}
