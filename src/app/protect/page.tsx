import type { Metadata } from "next";
import { ProtectTool } from "@/components/ProtectTool";

export const metadata: Metadata = {
  title: "Protect my photos",
  description: "Make watermarked, lower-resolution copies of your photos before you post them, with location and camera details removed.",
};

export default function ProtectPage() {
  return <ProtectTool />;
}
