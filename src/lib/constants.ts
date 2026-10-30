// Values shared by browser and server code.
export const REPORT_TAG = "raahat_report";
export const REPORT_FOLDER = "raahat/reports";
export const THEME_KEY = "raahat-theme"; // localStorage key for the light/dark choice
export const A11Y_KEY = "raahat-a11y"; // localStorage key for text size and high contrast
// Public address of the site, used in links the bots send and on fact-check cards.
export const SITE_URL = (process.env.PUBLIC_BASE_URL ?? "https://raahat-kappa.vercel.app").replace(/\/$/, "");
/** Polling cadence for automatic situation/incident updates. */
export const REPORT_REFRESH_MS = 5_000;
