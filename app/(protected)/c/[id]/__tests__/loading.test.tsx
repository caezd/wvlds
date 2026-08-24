import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileSidebarProvider } from "@/components/providers/MobileSidebarProvider";
import Loading from "@/app/(protected)/c/[id]/loading";

// AppShell masque toujours sa barre générique sur `/c/*` (cf. `isChatRoute`
// dans AppShell.tsx) en anticipant le ChatroomHeader de la page — qui est
// encore en Suspense derrière ce loading.tsx. Le bouton menu de secours doit
// donc être systématiquement présent ici, pas conditionnel.
describe("c/[id]/loading — bouton menu de secours pendant le chargement", () => {
  it("affiche un bouton menu accessible", () => {
    render(<MobileSidebarProvider><Loading /></MobileSidebarProvider>);
    expect(screen.getByLabelText("Ouvrir le menu")).toBeInTheDocument();
  });
});
