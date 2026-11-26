import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorldSharePanel } from "@/components/auth/WorldSharePanel";
import type { SharePreview } from "@/lib/sharePreview";

const MONDE: SharePreview = {
  id: "f1e4d2c9-e56f-454a-bde2-8f9eade06e65",
  name: "Hextech Gunblade 3000",
  description: "Brève description du monde",
  iconUrl: "https://x.supabase.co/icon.webp",
  bannerUrl: "https://x.supabase.co/banner.webp",
  color: null,
  ageRestricted: false,
  memberCount: 7,
  chatroomName: null,
};

describe("WorldSharePanel : le monde d'un lien partagé, colonne droite de la connexion", () => {
  it("montre le monde public : nom, description, membres, bannière en fond", () => {
    const { container } = render(<WorldSharePanel preview={MONDE} />);
    expect(screen.getByRole("heading", { name: "Hextech Gunblade 3000" })).toBeInTheDocument();
    expect(screen.getByText("Monde public")).toBeInTheDocument();
    expect(screen.getByText("Brève description du monde")).toBeInTheDocument();
    expect(screen.getByText("7 membres")).toBeInTheDocument();
    expect(container.innerHTML).toContain("banner.webp");
    // Pas de mention « en bêta » dans ce cas de figure.
    expect(screen.queryByText(/bêta/)).toBeNull();
  });

  it("un seul membre s'accorde au singulier", () => {
    render(<WorldSharePanel preview={{ ...MONDE, memberCount: 1 }} />);
    expect(screen.getByText("1 membre")).toBeInTheDocument();
  });

  it("un lien de salon nomme le salon", () => {
    render(<WorldSharePanel preview={{ ...MONDE, chatroomName: "La taverne du Pont-Rouge" }} />);
    expect(screen.getByText("La taverne du Pont-Rouge")).toBeInTheDocument();
  });

  it("un monde 18+ porte la mention ; la base n'a envoyé ni description ni image", () => {
    const { container } = render(
      <WorldSharePanel preview={{ ...MONDE, ageRestricted: true, description: null, iconUrl: null, bannerUrl: null }} />,
    );
    expect(screen.getByText("18+")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("banner.webp");
  });

  it("sans bannière, la couleur du monde sert de fond", () => {
    const { container } = render(<WorldSharePanel preview={{ ...MONDE, bannerUrl: null, color: "#336699" }} />);
    expect(container.innerHTML).toContain("rgb(51, 102, 153)");
  });
});
