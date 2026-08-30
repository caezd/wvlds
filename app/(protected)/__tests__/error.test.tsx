import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import ProtectedError from "@/app/(protected)/error";

/**
 * L'application n'avait aucune frontière d'erreur : toute erreur non rattrapée
 * remontait au traitement par défaut de Next — écran nu, sans marque, sans
 * autre issue qu'un rechargement manuel.
 */
describe("Frontière d'erreur des pages protégées", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("offre de réessayer sans recharger la page", () => {
    const reset = vi.fn();
    render(<ProtectedError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByText("retry"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offre un retour à l'accueil", () => {
    render(<ProtectedError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText("home").closest("a")).toHaveAttribute("href", "/");
  });

  it("affiche le digest — seul lien entre un rapport d'utilisateur et les logs serveur", () => {
    const error = Object.assign(new Error("boom"), { digest: "a1b2c3d4" });
    render(<ProtectedError error={error} reset={vi.fn()} />);
    expect(screen.getByText("a1b2c3d4")).toBeInTheDocument();
  });

  it("n'affiche rien à la place du digest quand il est absent", () => {
    render(<ProtectedError error={new Error("boom")} reset={vi.fn()} />);
    // Seuls le titre et la description subsistent dans le bloc de texte.
    expect(screen.queryByText(/^[0-9a-f]{8}$/)).toBeNull();
  });

  it("journalise l'erreur — Next ne consigne que le digest côté serveur", () => {
    const error = new Error("boom");
    render(<ProtectedError error={error} reset={vi.fn()} />);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Erreur non rattrapée"), error);
  });
});
