import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileSidebarProvider } from "@/components/providers/MobileSidebarProvider";
import Loading from "@/app/(protected)/w/[id]/loading";

// AppShell masque sa barre mobile générique dès que l'URL cible un onglet à
// header propre (cf. `hasWorldPanelHeader` dans AppShell.tsx) — mais ce
// header propre (avec son bouton menu) fait partie du contenu encore en
// Suspense derrière ce loading.tsx. Sans squelette, le bouton serait donc
// inaccessible pendant tout le chargement (bug rapporté par l'utilisateur).
const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.value,
}));

beforeEach(() => {
  searchParamsMock.value = new URLSearchParams();
});

describe("w/[id]/loading — bouton menu de secours pendant le chargement", () => {
  it("n'affiche pas de header de secours sur la vue par défaut (page d'accueil, qui garde la barre générique de AppShell)", () => {
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.queryByLabelText("Ouvrir le menu")).not.toBeInTheDocument();
  });

  it("affiche un bouton menu accessible quand l'URL cible un onglet à header propre (ex: ?view=timeline)", () => {
    searchParamsMock.value = new URLSearchParams("view=timeline");
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.getByLabelText("Ouvrir le menu")).toBeInTheDocument();
  });

  it("n'affiche pas de bouton de secours pour une valeur de `view` inconnue", () => {
    searchParamsMock.value = new URLSearchParams("view=inconnu");
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.queryByLabelText("Ouvrir le menu")).not.toBeInTheDocument();
  });
});
