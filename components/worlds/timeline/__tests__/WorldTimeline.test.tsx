import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

// Qui a ouvert chaque salon : la RPC get_chatroom_openers (migration 192).
type OpenerRow = { chat_id: string; author_name: string | null; persona_name: string | null; group_color: string | null };
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
function ouvreurs(rows: OpenerRow[]) {
  rpc.mockResolvedValue({ data: rows, error: null });
}
beforeEach(() => {
  rpc.mockReset();
  ouvreurs([]);
});

import { WorldTimeline } from "@/components/worlds/timeline/WorldTimeline";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 1,
  current_month: 1,
};

type Room = React.ComponentProps<typeof WorldTimeline>["rooms"][number];
const room = (id: string, title: string | null, year: number, month: number | null, day: number | null): Room => ({
  id, title, name: null, icon_url: null, timeline_date: { year, month, day },
});

function frise(rooms: Room[], config = CONFIG) {
  return render(<WorldTimeline worldId="w1" rooms={rooms} config={config} />);
}

const annees = () => screen.getAllByRole("heading", { level: 3 });

describe("WorldTimeline — frise verticale", () => {
  it("affiche « Chronologie » dans l'en-tête, sans bouton « Fermer »", () => {
    frise([]);
    expect(screen.getByText("Chronologie")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  });

  it("affiche un message quand aucune conversation n'est encore située", () => {
    frise([]);
    expect(screen.getByText(/Aucune conversation/)).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-now")).toBeNull();
  });

  it("une section par année, dans l'ordre, les salons triés par mois puis jour", () => {
    frise([room("c", "Retour", 3, 0, 4), room("b", "Suite", 1, 2, 2), room("a", "Prologue", 1, 0, 9)]);

    expect(annees().map((h) => h.textContent)).toEqual(["1An", "3An"]);
    const an1 = annees()[0].closest("li")!;
    const titres = within(an1).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(titres).toEqual(["Prologue, 9 Janvier, An 1", "Suite, 2 Mars, An 1"]);
  });

  it("un anneau par salon sur le fil, le jour à gauche du fil, sans le mois", () => {
    frise([room("a", "Prologue", 1, 1, 19), room("b", "Une année entière", 3, null, null)]);
    const salon = screen.getByRole("button", { name: /Prologue/ }).closest("li")!;
    const jour = within(salon).getByTestId("timeline-day");
    expect(jour.textContent).toBe("19");
    // À gauche du fil : 40px avant le début des titres (fil à 28px).
    expect(jour.className).toContain("right-[calc(100%+2.5rem)]");
    // L'anneau du salon, centré sur son titre (ligne de 20px).
    const anneau = within(salon).getByTestId("timeline-ring");
    expect(anneau.className.split(" ")).toEqual(expect.arrayContaining(["size-3", "top-1", "border-foreground/35"]));
    // Plus de ligne de date ni de pastille.
    expect(screen.queryByTestId("timeline-date")).toBeNull();
    expect(screen.queryByTestId("timeline-date-pill")).toBeNull();

    // Une date qui s'arrête à l'année : pas de jour, mais son anneau.
    const annee = screen.getByRole("button", { name: /Une année entière/ }).closest("li")!;
    expect(within(annee).queryByTestId("timeline-day")).toBeNull();
    expect(within(annee).getByTestId("timeline-ring")).toBeInTheDocument();
  });

  it("les salons d'une même date : chacun son anneau, le jour une seule fois", () => {
    frise([
      room("a", "Le messager", 2, 0, 9),
      room("b", "Deux lettres", 2, 0, 9),
      room("c", "L'héritière", 2, 0, 9),
      room("d", "Chasse", 2, 2, 27),
    ]);
    const groupes = document.querySelectorAll("[data-date-group]");
    expect(groupes).toHaveLength(2);
    const [neufJanvier, mars] = [...groupes] as HTMLElement[];
    expect(within(neufJanvier).getAllByTestId("timeline-ring")).toHaveLength(3);
    expect(within(neufJanvier).getAllByTestId("timeline-day").map((d) => d.textContent)).toEqual(["9"]);
    // En face du premier salon de la date.
    const premier = within(neufJanvier).getAllByRole("button")[0].closest("li")!;
    expect(within(premier).getByTestId("timeline-day")).toBeInTheDocument();
    // Chacun garde sa date complète pour les lecteurs d'écran.
    expect(within(neufJanvier).getByRole("button", { name: "Deux lettres, 9 Janvier, An 2" })).toBeInTheDocument();
    expect(within(mars).getAllByTestId("timeline-day").map((d) => d.textContent)).toEqual(["27"]);

    // Le mois n'est jamais à côté du jour : sur le filet qui l'ouvre, ou,
    // pour la première date de l'année, au-dessus d'elle.
    expect(within(mars).getByTestId("timeline-month-label")).toHaveTextContent("Mars");
    expect(within(neufJanvier).getByTestId("timeline-first-month")).toHaveTextContent("Janvier");
    expect(within(mars).queryByTestId("timeline-first-month")).toBeNull();
    // Plus de branche.
    expect(screen.queryByTestId("timeline-branch")).toBeNull();
  });

  it("l'année en très grands chiffres, sa légende en exposant, sans rouge", () => {
    frise([room("a", "Prologue", 1, 0, 1)], { ...CONFIG, era_name: "des Cendres" });
    const an1 = annees()[0];
    expect(within(an1).getByText("1").className).toMatch(/text-4xl.*sm:text-6xl/);
    const legende = within(an1).getByText("An des Cendres").className;
    expect(legende).toContain("text-muted-foreground");
    expect(legende).not.toMatch(/accent|red/);
  });

  it("des filets de la couleur des bordures, sans le tout premier", () => {
    frise([room("a", "Avant", 0, 0, 1), room("b", "Après", 1, 0, 1)]);
    const sections = annees().map((h) => h.closest("li")!);
    for (const s of sections) {
      expect(s.className.split(" ")).toContain("border-t");
      expect(s.className.split(" ")).toContain("border-border");
      expect(s.className).toContain("first:border-t-0");
    }
  });

  it("un filet sépare chaque mois d'une année, pas les salons d'un même mois", () => {
    frise([
      room("a", "Six janvier", 1, 0, 6),
      room("b", "Neuf janvier", 1, 0, 9),
      room("c", "Trois mars", 1, 2, 3),
      room("d", "Autre année", 2, 0, 1),
    ]);
    const ligne = (nom: string) => screen.getByRole("button", { name: new RegExp(nom) }).closest("[data-date-group]")!;
    // Le premier salon de l'année n'en a pas : le filet de l'année suffit.
    expect(ligne("Six janvier")).not.toHaveAttribute("data-new-month");
    expect(ligne("Neuf janvier")).not.toHaveAttribute("data-new-month");
    expect(ligne("Trois mars")).toHaveAttribute("data-new-month", "true");
    // De l'air de part et d'autre du filet : 24px au-dessus (16 + mt-2), 24px
    // dessous (pt-6).
    expect(ligne("Trois mars").className.split(" ")).toEqual(expect.arrayContaining(["mt-2", "pt-6"]));
    // Un filet en pointillés.
    expect(ligne("Trois mars").querySelector(".border-dashed.border-border")).not.toBeNull();
    // Le nom du nouveau mois — un seul ici.
    const noms = screen.getAllByTestId("timeline-month-label");
    expect(noms.map((l) => l.textContent)).toEqual(["Mars"]);
    // Posé sur le filet (centré sur lui, fond qui le découpe), en capitales.
    expect(noms[0].className.split(" ")).toEqual(
      expect.arrayContaining(["top-0", "-translate-y-1/2", "bg-body", "uppercase"]),
    );
    expect(ligne("Autre année")).not.toHaveAttribute("data-new-month");
  });

  it("le jour et le mois de chaque salon, sans couleur d'accent", () => {
    frise([room("a", "Prologue", 1, 1, 19)]);
    const ligne = screen.getByRole("button", { name: /Prologue/ });
    expect(ligne.innerHTML).not.toMatch(/accent|red-600/);
  });

  it("la date actuelle du monde se glisse parmi les salons, à son mois", () => {
    frise([room("a", "Janvier", 1, 0, 3), room("b", "Mars", 1, 2, 3)]);
    const an1 = annees()[0].closest("li")!;
    // Les entrées du fil : les dates et le trait, dans l'ordre.
    const lignes = [...an1.querySelector("ul")!.children] as HTMLElement[];
    expect(lignes.map((l) => l.dataset.testid ?? l.textContent)).toEqual([
      expect.stringContaining("Janvier"),
      "timeline-now",
      expect.stringContaining("Mars"),
    ]);
    const trait = screen.getByTestId("timeline-now");
    // Plus de texte visible sur la barre : seulement pour les lecteurs
    // d'écran, et au survol.
    expect(trait).toHaveAttribute("title", "Date actuelle du monde : Février, An 1");
    expect(within(trait).getByText("Date actuelle du monde : Février, An 1")).toHaveClass("sr-only");
    // Un trait rouge plein, du fil jusqu'au bord : pas sur la colonne des années.
    const barre = trait.querySelector(".h-0\\.5")!;
    expect(barre.className).toContain("bg-red-600");
    expect(barre.className.split(" ")).toContain("-left-7");
    expect(barre.className).not.toMatch(/rem\]/);
  });

  it("l'année actuelle a sa section même sans salon, pour porter son repère", () => {
    frise([room("a", "Jadis", 0, 0, 1)], { ...CONFIG, current_year: 4 });
    expect(annees().map((h) => h.textContent)).toEqual(["0An", "4An"]);
    expect(screen.getByTestId("timeline-now")).toBeInTheDocument();
  });

  it("au-delà de cinq ans, des pastilles mènent à chaque tranche", async () => {
    const user = userEvent.setup();
    frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 12, 0, 1)], { ...CONFIG, current_year: 12 });

    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    const pastilles = within(nav).getAllByRole("button");
    expect(pastilles.map((p) => p.textContent)).toEqual(["1 – 5", "11 – 15"]);
    // Ouverte sur l'année actuelle : sa tranche est la courante.
    expect(pastilles[1]).toHaveAttribute("aria-current", "true");

    await user.click(pastilles[0]);
    expect(pastilles[0]).toHaveAttribute("aria-current", "true");
    expect(pastilles[1]).not.toHaveAttribute("aria-current");
  });

  it("sur cinq ans ou moins, pas de pastilles", () => {
    frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 3, 0, 1)]);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("ouvrir un salon depuis la frise", async () => {
    const user = userEvent.setup();
    frise([room("a", "Prologue", 1, 0, 1)]);
    await user.click(screen.getByRole("button", { name: /Prologue/ }));
    expect(push).toHaveBeenCalledWith("/c/a");
  });
});

describe("WorldTimeline — lignes de salon", () => {
  it("survol discret, et un libellé par défaut sans titre", () => {
    frise([room("a", "Prologue", 1, 1, 19), room("b", null, 1, 1, null)]);

    const ligne = screen.getByRole("button", { name: /Prologue/ });
    // Une ligne basse, sans carte bordée ni fond au survol.
    expect(ligne.className).not.toMatch(/\bborder\b/);
    expect(ligne.className).not.toMatch(/hover:bg-|(^|\s)w-full\b/);
    // Atténué au repos, plein au survol : `text-primary` était presque blanc
    // en thème sombre, comme le texte, et le survol ne se voyait pas.
    const titre = within(ligne).getByText("Prologue").className;
    expect(titre).toContain("text-foreground/75");
    expect(titre).toContain("group-hover/room:text-foreground");
    expect(titre).not.toContain("text-primary");

    // Sans titre ni jour : un libellé par défaut, pas de jour inventé.
    const sansTitre = screen.getByRole("button", { name: "Conversation, Février, An 1" });
    expect(sansTitre).not.toHaveTextContent(/\d/);
  });
});

describe("WorldTimeline — qui a ouvert le salon", () => {
  it("« par Persona (@pseudo) » : le persona dans la couleur de son groupe, le pseudo neutre", async () => {
    ouvreurs([{ chat_id: "a", author_name: "Poumon", persona_name: "Tess", group_color: "#ef4444" }]);
    frise([room("a", "Prologue", 1, 0, 6)]);

    const par = await screen.findByTestId("timeline-opener");
    expect(par.textContent).toBe("par Tess (@Poumon)");
    expect(within(par).getByText("Tess")).toHaveStyle({ color: "#ef4444" });
    expect(rpc).toHaveBeenCalledWith("get_chatroom_openers", { p_world_id: "w1" });
    // Lu en entier par les lecteurs d'écran.
    expect(screen.getByRole("button", { name: "Prologue, par Tess (@Poumon), 6 Janvier, An 1" })).toBeInTheDocument();
  });

  it("sans persona (salon encore vide), « par @pseudo » ; persona sans groupe, sans couleur", async () => {
    ouvreurs([
      { chat_id: "a", author_name: "Proprio", persona_name: null, group_color: null },
      { chat_id: "b", author_name: "Poumon", persona_name: "Isolé", group_color: null },
    ]);
    frise([room("a", "Prologue", 1, 0, 6), room("b", "Suite", 1, 0, 7)]);

    const [vide, sansGroupe] = await screen.findAllByTestId("timeline-opener");
    expect(vide.textContent).toBe("par @Proprio");
    expect(within(vide).getByText("@Proprio").getAttribute("style")).toBeNull();
    expect(sansGroupe.textContent).toBe("par Isolé (@Poumon)");
    expect(within(sansGroupe).getByText("Isolé").getAttribute("style")).toBeNull();
  });

  it("une erreur de chargement laisse la frise intacte, sans « par … »", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    frise([room("a", "Prologue", 1, 0, 6)]);

    await vi.waitFor(() => expect(erreur).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Prologue/ })).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-opener")).toBeNull();
    erreur.mockRestore();
  });
});

describe("WorldTimeline — fond ambiant", () => {
  // Sous `lg`, `<main>` est transparent : c'est le `<body>` qu'on voit. Ce qui
  // découpe le fil ou les filets doit peindre ce fond-là, pas `bg-background`.
  const ambiant = (el: Element) => {
    const classes = el.className.split(" ");
    expect(classes).toContain("lg:bg-background");
    expect(classes.some((c) => c.startsWith("bg-body"))).toBe(true);
    expect(classes).not.toContain("bg-background");
  };

  it("anneaux, nom du mois et barre des périodes suivent le fond de la page", () => {
    frise([room("a", "Début", 1, 0, 1), room("b", "Mars", 1, 2, 1), room("c", "Fin", 12, 0, 1)], { ...CONFIG, current_year: 12 });
    for (const anneau of screen.getAllByTestId("timeline-ring")) ambiant(anneau);
    ambiant(screen.getByTestId("timeline-month-label"));
    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    expect(nav.className.split(" ")).toEqual(expect.arrayContaining(["bg-body/90", "lg:bg-background/90"]));
  });
});
