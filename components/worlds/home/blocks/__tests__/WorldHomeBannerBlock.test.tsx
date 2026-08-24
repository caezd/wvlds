import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldHomeBannerDialog, WorldHomeBannerView } from "@/components/worlds/home/blocks/WorldHomeBannerBlock";

describe("WorldHomeBannerView", () => {
  it("affiche le titre et le texte", () => {
    render(<WorldHomeBannerView banner={{ title: "Bienvenue", text: "Salut à tous" }} />);
    expect(screen.getByText("Bienvenue")).toBeInTheDocument();
    expect(screen.getByText("Salut à tous")).toBeInTheDocument();
  });

  it("n'affiche pas de bouton si le libellé ou l'URL manque", () => {
    render(<WorldHomeBannerView banner={{ title: "x", buttonLabel: "Voir" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("affiche le bouton quand libellé et URL sont tous deux présents", () => {
    render(<WorldHomeBannerView banner={{ title: "x", buttonLabel: "Voir", buttonUrl: "/wiki" }} />);
    expect(screen.getByRole("link", { name: "Voir" })).toHaveAttribute("href", "/wiki");
  });

  it("assombrit l'image d'un dégradé quand il y a du texte à lire par-dessus", () => {
    const { container } = render(<WorldHomeBannerView banner={{ title: "x", image: "/x.webp" }} />);
    expect(container.querySelector(".bg-gradient-to-t")).toBeInTheDocument();
  });

  it("retire le dégradé sur une image sans titre ni texte (purement visuelle)", () => {
    const { container } = render(<WorldHomeBannerView banner={{ image: "/x.webp", buttonLabel: "Voir", buttonUrl: "/wiki" }} />);
    expect(container.querySelector(".bg-gradient-to-t")).not.toBeInTheDocument();
  });
});

describe("WorldHomeBannerDialog", () => {
  it("le bouton de création est désactivé tant que titre, texte et image sont vides", () => {
    render(<WorldHomeBannerDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
  });

  it("appelle onSave avec le titre saisi", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeBannerDialog open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "Bienvenue");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(onSave).toHaveBeenCalledWith({ title: "Bienvenue", align: undefined });
  });

  it("pré-remplit les champs en édition et affiche « Enregistrer »", () => {
    render(
      <WorldHomeBannerDialog
        open
        onOpenChange={vi.fn()}
        initialBanner={{ title: "Ancien", text: "Ancien texte" }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Ancien")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ancien texte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });

  it("n'inclut le bouton dans le résultat que si libellé ET url sont renseignés", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeBannerDialog open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "x");
    await user.type(screen.getByPlaceholderText("Libellé du bouton"), "Voir");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(onSave).toHaveBeenCalledWith(expect.not.objectContaining({ buttonLabel: expect.anything() }));
  });

  it("inclut le bouton quand libellé et url sont tous deux renseignés", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeBannerDialog open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "x");
    await user.type(screen.getByPlaceholderText("Libellé du bouton"), "Voir");
    await user.type(screen.getByPlaceholderText("https://…"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ buttonLabel: "Voir", buttonUrl: "https://example.com" }),
    );
  });

  it("uploade une image de fond via onUploadImage et l'inclut dans le résultat", async () => {
    const onSave = vi.fn();
    const onUploadImage = vi.fn().mockResolvedValue("https://example.com/banner.webp");
    const user = userEvent.setup();
    render(<WorldHomeBannerDialog open onOpenChange={vi.fn()} onSave={onSave} onUploadImage={onUploadImage} />);

    const file = new File(["x"], "banner.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(onUploadImage).toHaveBeenCalledWith(file);
    await screen.findByText("Changer");

    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ image: "https://example.com/banner.webp" }));
  });

  it("le bouton Annuler ferme le dialogue sans appeler onSave", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldHomeBannerDialog open onOpenChange={onOpenChange} initialBanner={{ title: "x" }} onSave={onSave} />,
    );

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});
