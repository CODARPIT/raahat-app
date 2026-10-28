// Languages the website is offered in. The dictionaries live in src/locales (one file
// per language, loaded on the server); this file is safe to import anywhere.

/** Language stored on a report. The AI writes every summary in English and Hindi. */
export type Lang = "en" | "hi";

// India's most widely read scripts, with the flood- and cyclone-prone states covered
// (Assamese, Odia, Bengali). Each name is written in its own script.
export const LOCALES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "as", name: "অসমীয়া" },
  { code: "or", name: "ଓଡ଼ିଆ" },
  { code: "mr", name: "मराठी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "kn", name: "ಕನ್ನಡ" },
  { code: "ml", name: "മലയാളം" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "raahat-lang";

export const isLocale = (x: unknown): x is Locale => LOCALES.some((l) => l.code === x);

/** The best of our languages for an Accept-Language header, e.g. "bn-IN,bn;q=0.9,en;q=0.8". */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((w) => w.lang && w.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(isLocale) ?? DEFAULT_LOCALE;
}

/** Fill {placeholders}: fmt("Updated {time} IST", { time: "10:30" }). */
export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Reports keep English or Hindi; other languages read the English AI summary. */
export const storageLang = (locale: Locale): Lang => (locale === "hi" ? "hi" : "en");
