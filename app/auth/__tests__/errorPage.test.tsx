import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl/server", async () => {
  // Le mock de next-intl (vitest.setup.ts) traduit hors rendu : on l'emprunte
  // sous un autre nom, la règle des hooks ne s'appliquant pas ici.
  const { useTranslations: translator } = await import("next-intl");
  return { getTranslations: async (ns: string) => translator(ns) };
});

import Page from "@/app/auth/error/page";

describe("page d'erreur de l'authentification", () => {
  it("dit ce qui s'est passé dans la langue du visiteur, sans le message brut de Supabase", async () => {
    render(await Page({ searchParams: Promise.resolve({ error: "Token has expired or is invalid" }) }));
    expect(screen.getByRole("heading", { name: "Une erreur est survenue." })).toBeInTheDocument();
    expect(screen.getByText("Le lien a peut-être expiré ou déjà servi. Réessayez depuis la page de connexion.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à la connexion" })).toHaveAttribute("href", "/auth/login");
    expect(screen.queryByText(/Token has expired/)).toBeNull();
  });
});
