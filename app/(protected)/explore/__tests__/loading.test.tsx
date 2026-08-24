import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileSidebarProvider } from "@/components/providers/MobileSidebarProvider";
import Loading from "@/app/(protected)/explore/loading";

// AppShell masque toujours sa barre générique sur `/explore` (cf.
// `isExploreRoute` dans AppShell.tsx) en anticipant le WorldPanelHeader de la
// page — qui est encore en Suspense derrière ce loading.tsx. Le bouton menu
// de secours doit donc être systématiquement présent ici.
describe("explore/loading — bouton menu de secours pendant le chargement", () => {
  it("affiche un bouton menu accessible", () => {
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.getByLabelText("Ouvrir le menu")).toBeInTheDocument();
  });
});
