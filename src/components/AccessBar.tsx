"use client";

// The accessibility bar found on Indian government websites (GIGW): skip link,
// emergency numbers, text size, high contrast and dark mode. Choices are remembered
// on this device; the inline script in layout.tsx applies them before first paint.

import { useEffect, useState } from "react";
import { A11Y_KEY, THEME_KEY } from "@/lib/constants";

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

  const p = prefs ?? { text: "md", contrast: false };

  return (
    <div className="access-bar">
      <div className="access-inner">
        <a href="#main" className="skip-link">Skip to main content</a>
        <nav className="access-links" aria-label="Accessibility and site links">
          <a href="#main">Skip to main content</a>
          <a href="/accessibility">Screen reader access</a>
          <a href="/sitemap">Sitemap</a>
        </nav>
        <p className="access-help">
          <span>Emergency</span> <a href="tel:112" className="num">112</a>
          <span className="sep" aria-hidden>·</span>
          <span>Disaster helpline</span> <a href="tel:1078" className="num">1078</a>
        </p>
        <div className="access-tools" role="group" aria-label="Display settings">
          <span className="access-label" aria-hidden>Text</span>
          {(["sm", "md", "lg"] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`text-size text-size-${size}`}
              aria-pressed={p.text === size}
              aria-label={size === "sm" ? "Smaller text" : size === "md" ? "Normal text" : "Larger text"}
              onClick={() => apply({ ...p, text: size })}
            >
              {size === "sm" ? "A−" : size === "md" ? "A" : "A+"}
            </button>
          ))}
          <button type="button" className="tool" aria-pressed={p.contrast} onClick={() => apply({ ...p, contrast: !p.contrast })}>
            <span aria-hidden>◐</span> High contrast
          </button>
          <button type="button" className="tool" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span> {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </div>
    </div>
  );
}
