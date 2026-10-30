import OpsBoard from "@/components/OpsBoard";
import ResponderGate from "@/components/ResponderGate";
import { isResponder } from "@/lib/auth";

export const metadata = { title: "Control room" };
export const dynamic = "force-dynamic";

export default async function RespondPage() {
  if (!(await isResponder())) return <ResponderGate />;
  return <OpsBoard mode="responder" />;
}
