// Dispatch register for the control room: help is shared out by severity, nearest
// centre for Critical, centres further away for less urgent reports.
import { ControlShell } from "@/components/ControlShell";
import { DispatchPanel } from "@/components/DispatchPanel";
import ResponderGate from "@/components/ResponderGate";
import { isResponder } from "@/lib/auth";
import { rowFromReport, type DispatchRow } from "@/lib/dispatch-rows";
import { errorMessage } from "@/lib/errors";
import { listReports } from "@/lib/reports";

export const metadata = { title: "Dispatch register" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  if (!(await isResponder())) return <ResponderGate />;
  let live: DispatchRow[] = [];
  let error: string | null = null;
  try {
    live = (await listReports(500)).map(rowFromReport);
  } catch (err) {
    error = errorMessage(err);
  }

  return (
    <ControlShell active="dispatch">
      {error && <p className="error" role="alert">Couldn&rsquo;t load reports: {error}. The demo still works.</p>}
      <DispatchPanel live={live} />
    </ControlShell>
  );
}
