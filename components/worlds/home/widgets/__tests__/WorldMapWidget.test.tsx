import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

import { WorldMapWidget, loadMapWidgetData, type MapWidgetMap } from "@/components/worlds/home/widgets/WorldMapWidget";

// ──────────────────────────────────────────────────────────────────────────
// La carte était invisible tant qu'on ne cliquait pas son onglet : rien sur
// l'accueil ne disait qu'un monde en avait une, ni combien de lieux elle
// portait.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
// Le mock global de next-intl ne rend pas les pluriels ICU : on rend la clé
// et le nombre, ce qui suffit à prouver que le bon compte est passé.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) =>
    opts?.count !== undefined ? `${key}:${opts.count}` : key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const IMAGE = "https://x.supabase.co/storage/v1/object/public/worlds/world-w1/map-m1/a.webp";

const CARTES: MapWidgetMap[] = [
  { id: "m1", label: "Hadea", image_url: IMAGE, pin_count: 3 },
  { id: "m2", label: "Le donjon", image_url: null, pin_count: 1 },
];

beforeEach(() => vi.clearAllMocks());

describe("WorldMapWidget — rendu", () => {
  it("montre la première carte, ses lieux, et mène à elle", () => {
    render(<WorldMapWidget worldId="w1" initialMaps={CARTES} />);

    const vignette = screen.getByRole("img", { name: "Hadea" });
    // Une vignette, pas l'original de 4096 px.
    expect(vignette).toHaveAttribute("src", expect.stringContaining("width=640"));
    // Tous les lieux du monde, cartes confondues.
    expect(screen.getByText("widgetPlaces:4")).toBeInTheDocument();
    expect(vignette.closest("a")).toHaveAttribute("href", "/w/w1?view=map&map=m1");
  });

  it("nomme les autres cartes et mène à chacune", () => {
    render(<WorldMapWidget worldId="w1" initialMaps={CARTES} />);

    const liens = screen.getByRole("list", { name: "mapsTablist" });
    expect(liens).toHaveTextContent("Hadea");
    expect(liens).toHaveTextContent("Le donjon");
    expect(screen.getByRole("link", { name: "Le donjon" })).toHaveAttribute("href", "/w/w1?view=map&map=m2");
  });

  it("ne liste pas les cartes quand il n'y en a qu'une", () => {
    render(<WorldMapWidget worldId="w1" initialMaps={[CARTES[0]]} />);
    expect(screen.queryByRole("list", { name: "mapsTablist" })).toBeNull();
  });

  it("invite à en créer une quand le monde n'en a pas", () => {
    render(<WorldMapWidget worldId="w1" initialMaps={[]} />);

    const lien = screen.getByRole("link", { name: /noMapConfigured/ });
    expect(lien).toHaveAttribute("href", "/w/w1?view=map");
  });

  it("préfère une carte avec image à une carte vide placée avant", () => {
    render(<WorldMapWidget worldId="w1" initialMaps={[CARTES[1], CARTES[0]]} />);
    expect(screen.getByRole("img", { name: "Hadea" })).toBeInTheDocument();
  });
});

describe("WorldMapWidget — chargement", () => {
  it("charge lui-même quand le serveur n'a rien fourni", async () => {
    // Le bloc vient d'être ajouté à la grille : la page n'a pas été rechargée.
    const mock = createSupabaseMock({
      results: [
        { data: [{ id: "m1", label: "Hadea", image_url: IMAGE }] },
        { data: [{ map_id: "m1" }, { map_id: "m1" }] },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(<WorldMapWidget worldId="w1" />);

    expect(await screen.findByText("widgetPlaces:2")).toBeInTheDocument();
  });

  it("ne recharge pas ce que le serveur a déjà donné", () => {
    const mock = createSupabaseMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(<WorldMapWidget worldId="w1" initialMaps={CARTES} />);

    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("loadMapWidgetData", () => {
  it("compte les lieux de chaque carte", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: [{ id: "m1", label: "A", image_url: null }, { id: "m2", label: "B", image_url: null }] },
        { data: [{ map_id: "m1" }, { map_id: "m2" }, { map_id: "m1" }] },
      ],
    });

    const cartes = await loadMapWidgetData(mock.client as never, "w1");

    expect(cartes.map((c) => [c.id, c.pin_count])).toEqual([["m1", 2], ["m2", 1]]);
  });
});
