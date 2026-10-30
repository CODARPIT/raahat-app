"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./LocaleProvider";

export function EmergencyIcon({ kind, size = 24 }: { kind: "camera" | "phone" | "location" | "check"; size?: number }) {
  const paths = {
    camera: "M4 7h3l2-3h6l2 3h3v13H4z M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    phone: "M7 3H4v4c0 7 6 13 13 13h4v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2z",
    location: "M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    check: "M5 12l4 4L20 5",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={paths[kind]} /></svg>;
}

/** Always within reach on a phone, including while browsing the live map. */
export function EmergencyActions() {
  const path = usePathname();
  const { t: { report: t } } = useI18n();
  if (path === "/report" || path?.startsWith("/respond")) return null;
  return <>
    <div className="emergency-dock-space" aria-hidden />
    <aside className="emergency-dock" aria-label={t.urgentTitle}>
      <Link className="btn emergency-report-button" href="/report"><EmergencyIcon kind="camera" />{t.urgentTitle}</Link>
      <a className="btn emergency-call-button" href="tel:112"><EmergencyIcon kind="phone" />{t.urgentCall}</a>
    </aside>
  </>;
}
