"use client";

// Hands client components the current language and its strings. Only the sections
// client components use are sent to the browser, not every language.

import { createContext, useContext } from "react";
import type { Dict } from "@/locales/en";
import type { Locale } from "@/lib/i18n";

export type ClientDict = Pick<Dict, "access" | "nav" | "report" | "check" | "severity">;

const I18n = createContext<{ locale: Locale; t: ClientDict } | null>(null);

export function LocaleProvider({ locale, t, children }: { locale: Locale; t: ClientDict; children: React.ReactNode }) {
  return <I18n.Provider value={{ locale, t }}>{children}</I18n.Provider>;
}

export function useI18n() {
  const value = useContext(I18n);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider");
  return value;
}
