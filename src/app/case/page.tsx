import type { Metadata } from "next";
import { CaseFlow } from "@/components/CaseFlow";

export const metadata: Metadata = {
  title: "Prove it's fake",
  description: "Privately compare a morphed image with your real photo and build an evidence pack for cybercrime.gov.in.",
  robots: { index: false, follow: false },
};

export default function CasePage() {
  return <CaseFlow />;
}
