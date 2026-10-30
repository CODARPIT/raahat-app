// Responders only: every report (merged duplicates excluded) as a CSV for Excel,
// email or a district situation report.
import { errorMessage } from "@/lib/errors";
import { isResponder } from "@/lib/auth";
import { listReports } from "@/lib/reports";
import { reportsToCsv } from "@/lib/sitrep";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isResponder())) {
    return new Response(JSON.stringify({ error: "Enter the control-room passcode first." }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  let reports;
  try {
    reports = (await listReports(500)).filter((r) => !r.duplicateOf);
  } catch (err) {
    return new Response(JSON.stringify({ error: `Couldn't load reports: ${errorMessage(err)}` }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  // A byte-order mark so Excel opens Hindi summaries as UTF-8.
  return new Response("\uFEFF" + reportsToCsv(reports), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="raahat-reports-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
