import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WVLDS",
    short_name: "WVLDS",
    description: "Créez des mondes, incarnez vos personnages et écrivez vos histoires en temps réel.",
    start_url: "/",
    display: "standalone",
    background_color: "#1B1B1D",
    theme_color: "#1B1B1D",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
