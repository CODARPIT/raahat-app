"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { isLocated, type Report } from "@/lib/types";
import type { Incident } from "@/lib/incidents";
import { REPORT_REFRESH_MS } from "@/lib/constants";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="portal-map-loading" role="status" aria-busy="true">…</div>,
});

/** Public reports load automatically; the base map remains usable if reporting is offline. */
export function HomeMap({ unavailableLabel, reportCountLabel, privacyNote }: {
  unavailableLabel: string;
  reportCountLabel: string;
  privacyNote: string;
}) {
  const { t } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;
      try {
        // Even signed-in responders get the API's rounded public locations here.
        const response = await fetch("/api/reports", {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Reports unavailable");
        const data = await response.json() as { reports: Report[]; incidents?: Incident[]; stale?: boolean };
        if (!controller.signal.aborted) {
          setReports(data.reports.filter((r) => isLocated(r) && !r.duplicateOf && !r.needsReview && r.status !== "resolved" && r.status !== "rejected"));
          setIncidents(data.incidents ?? []);
          setStatus(data.stale ? "unavailable" : "ready");
        }
      } catch {
        if (!controller.signal.aborted) setStatus("unavailable");
      } finally {
        pending = false;
      }
    }

    void load();
    const interval = setInterval(() => { void load(); }, REPORT_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="portal-home-map">
      <div className="portal-map-stage" role="region" aria-label={t.nav.map}>
        <MapView reports={reports} incidents={incidents} center={[22.6, 79.4]} zoom={4} scrollWheelZoom={false} regionalOverview />
        <div className="map-legend" aria-label={t.nav.map}>
          {(["critical", "high", "moderate", "low"] as const).map((severity) => (
            <span key={severity}><i className="dot" data-sev={severity} aria-hidden />{t.severity[severity]}</span>
          ))}
        </div>
      </div>
      <div className="portal-map-caption">
        <span role="status" aria-busy={status === "loading"}>
          {status === "loading" ? "…" : status === "unavailable" ? unavailableLabel : `${reports.length} ${reportCountLabel}`}
        </span>
        <p>{privacyNote}</p>
      </div>
    </div>
  );
}
