import type { Severity } from "@/lib/types";

const LEVEL: Record<Severity, number> = { low: 1, moderate: 2, high: 3, critical: 4 };

/** A miniature flood-gauge staff: filled from the bottom up to the report's severity. */
export function Gauge({ severity, label }: { severity: Severity; label?: string }) {
  return (
    <span className="gauge sev" data-sev={severity} data-level={LEVEL[severity]} role="img" aria-label={label ?? `${severity} severity`}>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
