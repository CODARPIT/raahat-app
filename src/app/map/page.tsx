import OpsBoard from "@/components/OpsBoard";

export const metadata = { title: "Live map | Raahat" };

/** Public situation map: verified-looking reports only, faces pixelated, locations rounded. */
export default function MapPage() {
  return <OpsBoard mode="public" />;
}
