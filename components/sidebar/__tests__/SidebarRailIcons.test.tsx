import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { RailIcon } from "@/components/sidebar/SidebarRailIcons";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Radix pose l'infobulle dans un portail et exige un fournisseur ; ni l'un ni
// l'autre n'apporte quoi que ce soit au comportement vérifié ici.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const rendre = (props: Partial<React.ComponentProps<typeof RailIcon>> = {}) =>
  render(
    <RailIcon href="/admin" label="Administration" {...props}>
      <svg />
    </RailIcon>,
  );

describe("RailIcon", () => {
  it("n'affiche aucune pastille sans rien à signaler", () => {
    rendre({ badge: 0, badgeLabel: "3 signalements à trier" });

    expect(screen.getByRole("link", { name: "Administration" })).toBeInTheDocument();
  });

  it("affiche le nombre en pastille", () => {
    rendre({ badge: 3, badgeLabel: "3 signalements à trier" });

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  // Une pastille est une information, pas une décoration. L'infobulle ne la
  // porterait pas : elle n'est annoncée ni au clavier sur tous les lecteurs,
  // ni jamais au toucher.
  it("porte ce que la pastille signifie dans le nom du lien", () => {
    rendre({ badge: 3, badgeLabel: "3 signalements à trier" });

    expect(
      screen.getByRole("link", { name: "Administration — 3 signalements à trier" }),
    ).toBeInTheDocument();
  });

  // Un compteur à quatre chiffres déformerait le rail, dont la largeur est fixe.
  it("abrège un compte démesuré", () => {
    rendre({ badge: 250, badgeLabel: "250 signalements à trier" });

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("garde son nom simple quand rien n'est à signaler", () => {
    rendre({ badge: 0 });

    expect(screen.getByRole("link", { name: "Administration" })).toBeInTheDocument();
  });
});
