import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileSidebarProvider } from "@/components/providers/MobileSidebarProvider";
import Loading from "@/app/(protected)/w/[id]/loading";

// AppShell masque sa barre mobile générique sur tout `/w/` (cf. `isWorldRoute`
// dans AppShell.tsx) — mais le header propre de chaque vue (WorldPanelHeader
// pour les onglets, bouton incrusté sur la bannière pour l'accueil) fait
// partie du contenu encore en Suspense derrière ce loading.tsx. Sans
// squelette, le bouton serait donc inaccessible pendant tout le chargement
// (bug rapporté par l'utilisateur).
const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.value,
}));

beforeEach(() => {
  searchParamsMock.value = new URLSearchParams();
});

describe("w/[id]/loading — bouton menu de secours pendant le chargement", () => {
  it("affiche sur la vue par défaut un bouton repris à l'identique de la bannière, pour qu'il ne se déplace pas à l'arrivée du contenu", () => {
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    const button = screen.getByLabelText("Ouvrir le menu");
    expect(button).toBeInTheDocument();
    // Style de la bannière (cf. WorldHome.tsx), pas celui du WorldPanelHeader.
    expect(button.className).toContain("bg-black/30");
    // L'enveloppe ne doit pas réserver de hauteur en desktop, où le bouton
    // n'est jamais rendu.
    expect(button.parentElement).toHaveClass("lg:hidden");
  });

  it("affiche un bouton menu accessible quand l'URL cible un onglet à header propre (ex: ?view=timeline)", () => {
    searchParamsMock.value = new URLSearchParams("view=timeline");
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    const button = screen.getByLabelText("Ouvrir le menu");
    expect(button).toBeInTheDocument();
    expect(button.className).not.toContain("bg-black/30");
  });

  it("retombe sur le squelette d'accueil pour une valeur de `view` inconnue, comme le contenu réel", () => {
    searchParamsMock.value = new URLSearchParams("view=inconnu");
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.getByLabelText("Ouvrir le menu").className).toContain("bg-black/30");
  });
});
