// The visitor's language, on the server: their choice from the language menu (a
// cookie), else the best match for their phone's language, else English.

import { cookies, headers } from "next/headers";
import { DICTS, type Dict } from "@/locales";
import { isLocale, LANG_COOKIE, matchLocale, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchLocale((await headers()).get("accept-language"));
}

export async function getI18n(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTS[locale] };
}
