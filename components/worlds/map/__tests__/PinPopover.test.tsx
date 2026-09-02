import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PinPopover } from "@/components/worlds/map/PinPopover";
import type { MapPin } from "@/app/actions/worldMap";

// ──────────────────────────────────────────────────────────────────────────
// La carte est l'index géographique d'un monde, et le wiki en est le texte :
// rien ne les reliait. Une épingle peut désormais renvoyer à la page du lieu
// qu'elle marque.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const updateMapPin = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/actions/worldMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/actions/worldMap")>()),
  updateMapPin,
  deleteMapPin: vi.fn(),
}));

// L'éditeur de paragraphe charge tout le composeur : un champ suffit ici.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

const PAGES = [
  { id: "p1", title: "Arkham", slug: "arkham" },
  { id: "p2", title: "Innsmouth", slug: "innsmouth" },
];

function pin(overrides: Partial<MapPin> = {}): MapPin {
  return {
    id: "pin1",
    world_id: "w1",
    x: 50,
    y: 50,
    title: "Le port",
    description: null,
    banner_url: null,
    color: "#6366f1",
    icon: "map-pin",
    icon_color: "#ffffff",
    border_color: null,
    border_style: "none",
    sort_index: 0,
    wiki_page_id: null,
    ...overrides,
  };
}

function monter(p: MapPin, isEditMode = false) {
  const mock = createSupabaseMock({ results: [{ data: PAGES, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const onUpdated = vi.fn();
  render(
    <PinPopover
      pin={p}
      pos={{ left: 100, top: 100 }}
      isEditMode={isEditMode}
      userId="u1"
      worldId="w1"
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onDelete={vi.fn()}
    />,
  );
  return { onUpdated };
}

beforeEach(() => {
  pushMock.mockReset();
  updateMapPin.mockClear();
});

describe("PinPopover — page du wiki", () => {
  it("ouvre la page liée depuis l'épingle", async () => {
    monter(pin({ wiki_page_id: "p1" }));

    const lien = await screen.findByRole("button", { name: /Ouvrir la page du wiki : Arkham/ });
    await userEvent.click(lien);

    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("associe une page en modifiant l'épingle", async () => {
    const { onUpdated } = monter(pin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Page du wiki" }), "p2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({ wiki_page_id: "p2" }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ wiki_page_id: "p2" }));
  });

  it("ne montre aucun lien quand l'épingle n'a pas de page", async () => {
    monter(pin());

    // Les pages arrivent ; rien n'est lié.
    await screen.findByText("Le port");
    expect(screen.queryByRole("button", { name: /Ouvrir la page du wiki/ })).toBeNull();
  });
});
