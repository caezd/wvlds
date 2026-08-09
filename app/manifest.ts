import type { MetadataRoute } from "next";
import { getFavoriteWorlds } from "@/lib/currentRequest";

// Route jamais gardée par le middleware d'auth (voir proxy.ts) — un visiteur
// non connecté doit pouvoir installer l'app, donc getFavoriteWorlds() doit
// tolérer l'absence de session (retourne []) plutôt que d'en dépendre.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const favorites = await getFavoriteWorlds();

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
    // L'OS ne refetch le manifest que périodiquement (pas à chaque
    // lancement) : un favori ajouté/retiré peut mettre du temps à se
    // refléter dans les raccourcis — limite native de l'API, non contournable.
    shortcuts: favorites.map((w) => ({
      name: w.name,
      url: `/w/${w.id}`,
      icons: [{ src: w.icon_url ?? "/icons/icon-192.png", sizes: "192x192" }],
    })),
  };
}
