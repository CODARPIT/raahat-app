import type { MetadataRoute } from "next";

// Lets someone keep Raahat Shield on their home screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raahat Shield: prove a morphed photo is fake",
    short_name: "Raahat Shield",
    description: "Prove a morphed photo is fake, build a police-ready evidence pack, and protect future photos. Private, no sign-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f2f9",
    theme_color: "#3b1f4a",
    lang: "en-IN",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    shortcuts: [
      { name: "Prove it's fake", url: "/case" },
      { name: "Protect my photos", url: "/protect" },
    ],
  };
}
