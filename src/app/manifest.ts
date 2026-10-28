import type { MetadataRoute } from "next";

// Lets citizens and responders add Raahat to their home screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raahat: Citizen Disaster Reporting & Triage Portal",
    short_name: "Raahat",
    description: "Report a disaster photo in under a minute; control rooms see the most urgent first.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2f0",
    theme_color: "#0f2f4f",
    lang: "en-IN",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    shortcuts: [
      { name: "Report an incident", url: "/report" },
      { name: "Control room", url: "/respond" },
    ],
  };
}
