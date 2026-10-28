"use client";

// The accessibility bar found on Indian government websites (GIGW): skip link,
// emergency numbers, language, text size, high contrast and dark mode. Display choices
// are remembered on this device (the inline script in layout.tsx applies them before
// first paint); the language is a cookie, so the server renders the right one.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { A11Y_KEY, THEME_KEY } from "@/lib/constants";
import { LANG_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

type TextSize = "sm" | "md" | "lg";
type Theme = "light" | "dark";
interface Prefs {
  text: TextSize;
  contrast: boolean;
}

const root = () => document.documentElement;

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the setting still applies for this visit
  }
}

function currentTheme(): Theme {
  const set = root().dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AccessBar() {
  const { locale, t: { access: t } } = useI18n();
  const router = useRouter();
  // null until mounted, so the server render and the first client render match.
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = root().dataset.text;
    setPrefs({ text: t === "sm" || t === "lg" ? t : "md", contrast: root().dataset.contrast === "high" });
    setTheme(currentTheme());
  }, []);

  function apply(next: Prefs) {
    if (next.text === "md") delete root().dataset.text;
    else root().dataset.text = next.text;
    if (next.contrast) root().dataset.contrast = "high";
    else delete root().dataset.contrast;
    save(A11Y_KEY, JSON.stringify(next));
    setPrefs(next);
  }

  function toggleTheme() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    root().dataset.theme = next;
    save(THEME_KEY, next);
    setTheme(next);
  }

  function chooseLanguage(next: Locale) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const p = prefs ?? { text: "md", contrast: false };

  return (
    <div className="access-bar">
      <div className="access-inner">
        <a href="#main" className="skip-link">{t.skip}</a>
        <nav className="access-links" aria-label="Accessibility and site links">
          <a href="#main">{t.skip}</a>
          <a href="/accessibility">{t.screenReader}</a>
          <a href="/sitemap">{t.sitemap}</a>
        </nav>
        <p className="access-help">
          <span className="help-item">{t.emergency} <a href="tel:112" className="num">112</a></span>
          <span className="sep" aria-hidden>·</span>
          <span className="help-item">{t.disasterHelpline} <a href="tel:1078" className="num">1078</a></span>
        </p>
        <label className="lang-pick">
          <span aria-hidden>अ/A</span>
          <span className="sr-only">{t.language} / Language</span>
          <select value={locale} onChange={(e) => chooseLanguage(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
            ))}
          </select>
        </label>
        <div className="access-tools" role="group" aria-label="Display settings">
          <span className="access-label" aria-hidden>{t.text}</span>
          {(["sm", "md", "lg"] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`text-size text-size-${size}`}
              aria-pressed={p.text === size}
              aria-label={size === "sm" ? t.smaller : size === "md" ? t.normal : t.larger}
              onClick={() => apply({ ...p, text: size })}
            >
              {size === "sm" ? "A−" : size === "md" ? "A" : "A+"}
            </button>
          ))}
          <button type="button" className="tool" aria-pressed={p.contrast} onClick={() => apply({ ...p, contrast: !p.contrast })}>
            <span aria-hidden>◐</span> {t.contrast}
          </button>
          <button type="button" className="tool" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span> {theme === "dark" ? t.light : t.dark}
          </button>
        </div>
      </div>
    </div>
  );
}
