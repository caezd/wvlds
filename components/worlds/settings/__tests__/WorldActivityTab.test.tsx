import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import fr from "@/messages/fr.json";
import { createSupabaseMock } from "@/test/supabaseMock";
import type { WorldActivityEntry } from "@/lib/worldActivity";

vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
const fetchWorldActivity = vi.fn();
vi.mock("@/lib/worldActivity", async (orig) => ({
  ...(await orig<typeof import("@/lib/worldActivity")>()),
  fetchWorldActivity: (...a: unknown[]) => fetchWorldActivity(...a),
}));
let mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => mock.client }));

import { WorldActivityTab } from "../WorldActivityTab";

const UNITES = [
  { name: "Or", short: "po", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];

function entree(partial: Partial<WorldActivityEntry>): WorldActivityEntry {
  return {
    id: "a1", domain: "economy", kind: "purchase", actor_id: "u1", actor: { username: "cae" },
    persona_id: "p1", persona_name: "Brom", target_persona_id: null, target_persona_name: null,
    amount: 0, items: [], note: null, ref_id: null, data: {}, created_at: "2026-11-25T10:00:00.000Z",
    ...partial,
  };
}
const objet = (name: string, quantity: number) => ({
  catalog_item_id: "c1", name, icon: null, lucide_icon: null, image_url: null, quantity,
});

function monter() {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <WorldActivityTab worldId="w1" units={UNITES} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  fetchWorldActivity.mockReset();
  mock = createSupabaseMock({
    results: [{ data: [{ id: "p1", name: "Brom" }, { id: "p2", name: "Ysolde" }] }],
  });
});

describe("WorldActivityTab", () => {
  it("une phrase par événement, avec son auteur", async () => {
    fetchWorldActivity.mockResolvedValue({
      entries: [
        entree({ id: "1", kind: "purchase", amount: 250, items: [objet("Épée", 2)], data: { shop_name: "Forge" } }),
        entree({ id: "2", kind: "sale", amount: 40, items: [objet("Potion", 1)], data: { shop_name: "Herboriste" } }),
        entree({ id: "3", kind: "transfer", amount: 105, items: [objet("Clé", 1)], target_persona_name: "Ysolde" }),
        entree({ id: "4", kind: "balance_adjust", amount: -100, note: "Amende" }),
        entree({ id: "5", kind: "item_adjust", items: [objet("Lanterne", -1)] }),
        entree({ id: "6", kind: "slots_purchase", amount: 30, data: { slots: 2 } }),
        entree({ id: "7", kind: "balance_adjust", amount: 5, persona_name: null, actor: null }),
      ],
      cursor: null,
    });
    monter();
    const items = await screen.findAllByTestId("activity-item");
    const textes = items.map((li) => li.textContent);
    expect(textes[0]).toContain("Brom a acheté Épée ×2 à Forge pour 2 po 50 pc");
    expect(textes[1]).toContain("Brom a revendu Potion à Herboriste pour 40 pc");
    expect(textes[2]).toContain("Brom a donné 1 po 5 pc, Clé à Ysolde");
    expect(textes[3]).toContain("Bourse de Brom : −1 po");
    expect(textes[3]).toContain("Amende");
    expect(textes[4]).toContain("Inventaire de Brom : −1 Lanterne");
    expect(textes[5]).toContain("Brom a acheté 2 emplacements pour 30 pc");
    expect(textes[0]).toContain("cae");
    // Persona supprimé, auteur inconnu (la base) : la trace reste lisible.
    expect(textes[6]).toContain("Bourse de Persona supprimé : +5 pc");
    expect(textes[6]).toContain("Système");
  });

  it("vide : un message", async () => {
    fetchWorldActivity.mockResolvedValue({ entries: [], cursor: null });
    monter();
    expect(await screen.findByText("Aucune activité pour l’instant.")).toBeInTheDocument();
  });

  it("les filtres relancent la lecture depuis le début", async () => {
    fetchWorldActivity.mockResolvedValue({ entries: [], cursor: null });
    monter();
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenCalledTimes(1));
    expect(fetchWorldActivity.mock.calls[0].slice(1, 4)).toEqual(["w1", { kind: null, personaId: null, from: null, to: null }, null]);

    await userEvent.selectOptions(screen.getByLabelText("Type"), "transfer");
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ kind: "transfer" }), null,
    ));

    // Le persona se cherche par son nom, parmi ceux du monde.
    const persona = screen.getByRole("combobox", { name: "Persona" });
    expect(persona).toHaveTextContent("Tous les personas");
    await userEvent.click(persona);
    await userEvent.type(await screen.findByPlaceholderText("Chercher un persona"), "ysol");
    expect(screen.queryByRole("option", { name: "Brom" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Ysolde" }));
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ kind: "transfer", personaId: "p2" }), null,
    ));
    expect(screen.getByRole("combobox", { name: "Persona" })).toHaveTextContent("Ysolde");
    expect(mock.builders[0].table).toBe("personas");
    expect(mock.builders[0].builder.eq).toHaveBeenCalledWith("world_id", "w1");
  });

  it("le persona choisi se retire : retour à tous les personas", async () => {
    fetchWorldActivity.mockResolvedValue({ entries: [], cursor: null });
    monter();
    await userEvent.click(screen.getByRole("combobox", { name: "Persona" }));
    await userEvent.click(await screen.findByRole("option", { name: "Brom" }));
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ personaId: "p1" }), null,
    ));
    await userEvent.click(screen.getByRole("combobox", { name: "Persona" }));
    await userEvent.click(await screen.findByRole("option", { name: "Tous les personas" }));
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ personaId: null }), null,
    ));
  });

  it("la période se choisit au calendrier, du premier au dernier jour, et s'efface", async () => {
    fetchWorldActivity.mockResolvedValue({ entries: [], cursor: null });
    monter();
    const periode = screen.getByRole("button", { name: /Période/ });
    expect(periode).toHaveTextContent("Toutes les dates");
    await userEvent.click(periode);
    await screen.findByRole("grid");
    // Le mois en cours s'affiche d'abord.
    const now = new Date();
    const jour = (d: number) =>
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const bouton = (d: number) =>
      within(screen.getByRole("grid")).getAllByRole("button").find((b) => b.closest("[data-day]") && b.textContent === String(d)
        && !b.closest("[data-outside]") && !b.closest(".rdp-outside"))!;
    await userEvent.click(bouton(3));
    await userEvent.click(bouton(12));
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ from: jour(3), to: jour(12) }), null,
    ));

    await userEvent.click(screen.getByRole("button", { name: "Toutes les dates" }));
    await waitFor(() => expect(fetchWorldActivity).toHaveBeenLastCalledWith(
      expect.anything(), "w1", expect.objectContaining({ from: null, to: null }), null,
    ));
  });

  it("aucun persona ne correspond : un message", async () => {
    fetchWorldActivity.mockResolvedValue({ entries: [], cursor: null });
    monter();
    await userEvent.click(screen.getByRole("combobox", { name: "Persona" }));
    await userEvent.type(await screen.findByPlaceholderText("Chercher un persona"), "zzz");
    expect(await screen.findByText("Aucun persona ne correspond.")).toBeInTheDocument();
  });

  it("« Voir plus » charge la page suivante à la suite", async () => {
    const curseur = { created_at: "2026-11-25T09:00:00.000Z", id: "1" };
    fetchWorldActivity
      .mockResolvedValueOnce({ entries: [entree({ id: "1", kind: "sale", amount: 1, data: { shop_name: "A" } })], cursor: curseur })
      .mockResolvedValueOnce({ entries: [entree({ id: "2", kind: "sale", amount: 2, data: { shop_name: "B" } })], cursor: null });
    monter();
    await screen.findAllByTestId("activity-item");
    await userEvent.click(screen.getByRole("button", { name: "Voir plus" }));
    await waitFor(() => expect(screen.getAllByTestId("activity-item")).toHaveLength(2));
    expect(fetchWorldActivity).toHaveBeenLastCalledWith(expect.anything(), "w1", expect.anything(), curseur);
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull();
  });
});
