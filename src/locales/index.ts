// Server-side registry of every dictionary. Client components never import this:
// the layout passes them only the current language (see LocaleProvider).

import type { Locale } from "@/lib/i18n";
import asm from "./as";
import bn from "./bn";
import en, { type Dict } from "./en";
import gu from "./gu";
import hi from "./hi";
import kn from "./kn";
import ml from "./ml";
import mr from "./mr";
import or from "./or";
import pa from "./pa";
import ta from "./ta";
import te from "./te";

export type { Dict };

export const DICTS: Record<Locale, Dict> = { en, hi, bn, as: asm, or, mr, gu, pa, ta, te, kn, ml };
