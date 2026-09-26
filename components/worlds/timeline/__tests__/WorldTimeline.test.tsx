import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

// Un faux client qui répond par table et par RPC : la frise lance ses
// requêtes en parallèle, l'ordre des appels ne doit rien décider.
type OpenerRow = { chat_id: string; author_name: string | null; persona_name: string | null; group_color: string | null };
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  rpcs: {} as Record<string, { data: unknown; error: unknown }>,
  writes: [] as { table: string; op: string; payload?: unknown }[],
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order", "in", "is", "single", "maybeSingle"]) b[m] = () => b;
    for (const op of ["insert", "update", "delete"]) {
      b[op] = (payload?: unknown) => { db.writes.push({ table, op, payload }); return b; };
    }
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(resolve);
    return b;
  }
  const client = { rpc, from: (table: string) => builder(table) };
  return { createClient: () => client };
});
function ouvreurs(rows: OpenerRow[]) {
  db.rpcs.get_chatroom_openers = { data: rows, error: null };
}
beforeEach(() => {
  db.tables = {};
  db.rpcs = {};
  db.writes = [];
  rpc.mockReset();
  rpc.mockImplementation((name: string) => Promise.resolve(db.rpcs[name] ?? { data: [], error: null }));
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
    db.rpcs.get_chatroom_openers = { data: null, error: { message: "boom" } };
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
    // La tête collante (recherche, filtres, périodes) porte le fond.
    expect(nav.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "bg-body/90", "lg:bg-background/90"]));
  });
});

describe("WorldTimeline — événements, journaux, arcs, suites", () => {
  it("un événement : un losange sur le fil, son texte, sa page du wiki", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_events = [{
      id: "e1", title: "Couronnement", description: "La reine est sacrée.", timeline_date: { year: 1, month: 0, day: 6 },
      wiki_page_id: "p1", wiki_page: { slug: "reine", title: "La reine" },
    }];
    frise([room("a", "Prologue", 1, 0, 6)]);

    const marque = await screen.findByTestId("timeline-event-mark");
    const evenement = marque.closest("li")!;
    expect(evenement).toHaveTextContent("Couronnement");
    expect(evenement).toHaveTextContent("La reine est sacrée.");
    // Même date que le salon : l'événement d'abord, le jour une seule fois.
    const groupe = evenement.closest("[data-date-group]") as HTMLElement;
    expect(within(groupe).getAllByTestId("timeline-day")).toHaveLength(1);
    expect(within(evenement).getByTestId("timeline-day")).toBeInTheDocument();

    await user.click(within(evenement).getByRole("button", { name: "La reine" }));
    expect(push).toHaveBeenCalledWith("/w/w1?view=wiki&page=reine");
    // Sans la permission, pas de bouton pour modifier.
    expect(screen.queryByRole("button", { name: "Modifier l'événement Couronnement" })).toBeNull();
  });

  it("qui gère la chronologie ajoute un événement et en modifie un", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_events = [{
      id: "e1", title: "Couronnement", description: null, timeline_date: { year: 1, month: 0, day: 6 }, wiki_page_id: null, wiki_page: null,
    }];
    render(<WorldTimeline worldId="w1" rooms={[room("a", "Prologue", 1, 0, 6)]} config={CONFIG} canManage />);

    await user.click(screen.getByRole("button", { name: /^Événement$/ }));
    expect(await screen.findByRole("dialog", { name: "Nouvel événement" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Couronnement de la reine"), "La grande crue");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    const ecrit = db.writes.find((w) => w.table === "world_timeline_events" && w.op === "insert");
    expect(ecrit?.payload).toMatchObject({ title: "La grande crue", world_id: "w1", timeline_date: { year: 1, month: 1, day: null } });

    // Modifier un événement existant.
    await user.click(await screen.findByRole("button", { name: "Modifier l'événement Couronnement" }));
    expect(await screen.findByRole("dialog", { name: "Modifier l'événement" })).toBeInTheDocument();
  });

  it("sans la permission, ni ajout d'événement ni arcs", () => {
    frise([room("a", "Prologue", 1, 0, 6)]);
    expect(screen.queryByRole("button", { name: /^Événement$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Arcs$/ })).toBeNull();
  });

  it("les journaux : seulement si le monde les montre", async () => {
    db.tables.persona_journal_entries = [{
      id: "j1", persona_id: "p-tess", body: "Une nuit sans lune.", timeline_date: { year: 1, month: 0, day: 6 }, persona: { name: "Tess" },
    }];
    const { unmount } = frise([room("a", "Prologue", 1, 0, 6)]);
    await screen.findByText("Prologue");
    expect(screen.queryByText("Journal de Tess")).toBeNull();
    unmount();

    frise([room("a", "Prologue", 1, 0, 6)], { ...CONFIG, show_journals: true });
    expect(await screen.findByText("Journal de Tess")).toBeInTheDocument();
    expect(screen.getByText("Une nuit sans lune.")).toBeInTheDocument();
  });

  it("un arc teinte l'anneau et s'affiche après le titre", async () => {
    db.tables.world_timeline_arcs = [{ id: "arc", name: "L'exil", color: "#22c55e", position: 0 }];
    db.tables.chatrooms = [{ id: "a", arc_id: "arc", previous_chatroom_id: null, category_id: null }];
    frise([room("a", "Exil à l'est", 1, 0, 6)]);

    const etiquette = await screen.findByTestId("timeline-arc");
    expect(etiquette).toHaveTextContent("L'exil");
    const salon = etiquette.closest("li")!;
    expect(within(salon).getByTestId("timeline-ring")).toHaveStyle({ borderColor: "#22c55e" });
    expect(screen.getByRole("button", { name: /arc L'exil/ })).toBeInTheDocument();
  });

  it("une suite se relie d'une ligne quand les deux salons sont à l'écran", async () => {
    db.tables.chatrooms = [
      { id: "a", arc_id: null, previous_chatroom_id: null, category_id: null },
      { id: "b", arc_id: null, previous_chatroom_id: "a", category_id: null },
    ];
    frise([room("a", "La grande crue", 1, 0, 6), room("b", "Les digues cèdent", 3, 0, 1)]);
    const liens = await screen.findByTestId("timeline-suite-links");
    expect(liens.querySelector("[data-suite='a>b']")).not.toBeNull();
  });
});

describe("WorldTimeline — recherche et filtres", () => {
  it("la recherche ne garde que ce qui correspond, sans tenir compte des accents", async () => {
    const user = userEvent.setup();
    frise([room("a", "Le siège de Vaudrel", 1, 0, 6), room("b", "La comète", 1, 2, 1)]);
    await user.type(screen.getByRole("searchbox", { name: "Rechercher dans la chronologie" }), "siege");
    expect(screen.getByText("Le siège de Vaudrel")).toBeInTheDocument();
    expect(screen.queryByText("La comète")).toBeNull();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "introuvable");
    expect(screen.getByTestId("timeline-no-match")).toHaveTextContent("Rien ne correspond");
  });

  it("filtrer par persona : les salons où il a écrit", async () => {
    const user = userEvent.setup();
    db.rpcs.get_chatroom_personas = {
      data: [{ chat_id: "a", persona_id: "p-tess", persona_name: "Tess" }, { chat_id: "b", persona_id: "p-ivo", persona_name: "Ivo" }],
      error: null,
    };
    frise([room("a", "Avec Tess", 1, 0, 6), room("b", "Avec Ivo", 1, 2, 1)]);

    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Persona présent" }), "Tess");
    expect(screen.getByText("Avec Tess")).toBeInTheDocument();
    expect(screen.queryByText("Avec Ivo")).toBeNull();
    expect(screen.getByTestId("timeline-filters-count")).toHaveTextContent("1");
  });
});

describe("WorldTimeline — saisons", () => {
  it("les saisons remplacent les tranches de cinq ans et ouvrent leurs années d'un bandeau", () => {
    frise(
      [room("a", "Début", 1, 0, 1), room("b", "Milieu", 12, 0, 1), room("c", "Fin", 15, 0, 1)],
      { ...CONFIG, current_year: 12, ages: [{ name: "Âge des Cendres", from_year: 10, to_year: 19 }] },
    );
    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["1 – 5", "Âge des Cendres"]);
    expect(within(nav).getByRole("button", { name: "Âge des Cendres" })).toHaveAttribute("aria-current", "true");
    // Un bandeau, une seule fois, avant la première année de la saison.
    const bandeaux = screen.getAllByTestId("timeline-age");
    expect(bandeaux).toHaveLength(1);
    expect(bandeaux[0]).toHaveTextContent("Âge des Cendres");
    expect(bandeaux[0]).toHaveTextContent("An 10 – 19");
  });
});

describe("WorldTimeline — styles des suites", () => {
  const CHAINE = [
    { id: "a", arc_id: null, previous_chatroom_id: null, category_id: null },
    { id: "b", arc_id: null, previous_chatroom_id: "a", category_id: null },
    { id: "c", arc_id: null, previous_chatroom_id: "b", category_id: null },
  ];
  const SALONS = () => [room("a", "La grande crue", 1, 0, 6), room("b", "Les digues cèdent", 1, 2, 1), room("c", "Ce que charrie l'eau", 3, 0, 1), room("z", "Hors chaîne", 3, 1, 1)];

  async function choisirStyle(nom: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Style des suites" }), nom);
    return user;
  }

  // Un stockage en mémoire : celui de l'environnement de test n'est pas
  // fonctionnel, et le composant s'en passe sans erreur.
  let memoire: Map<string, string>;
  beforeEach(() => {
    memoire = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => memoire.get(k) ?? null,
        setItem: (k: string, v: string) => { memoire.set(k, v); },
        removeItem: (k: string) => { memoire.delete(k); },
      },
    });
  });

  it("relit le style gardé à l'ouverture", async () => {
    memoire.set("wvlds:timeline-suite-style", "graph");
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    await vi.waitFor(() => expect(screen.getByTestId("timeline-suite-links")).toHaveAttribute("data-style", "graph"));
  });

  it("par défaut, un rail par chaîne, une pastille par salon", async () => {
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    const calque = await screen.findByTestId("timeline-suite-links");
    expect(calque).toHaveAttribute("data-style", "rail");
    // Une seule chaîne a → b → c, trois pastilles.
    expect(calque.querySelectorAll("[data-suite]")).toHaveLength(1);
    expect(calque.querySelector("[data-suite='a>b>c']")!.querySelectorAll("circle")).toHaveLength(3);
  });

  it("graphe : les titres se décalent pour laisser les couloirs entre le fil et eux", async () => {
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    await screen.findByTestId("timeline-suite-links");
    await choisirStyle("Graphe à côté du fil");
    const calque = screen.getByTestId("timeline-suite-links");
    expect(calque).toHaveAttribute("data-style", "graph");
    const liste = document.querySelector("[data-suite-style='graph'] ol") as HTMLElement;
    expect(parseFloat(liste.style.getPropertyValue("--tl-graph-pad"))).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /La grande crue/ }).className).toContain("ml-[var(--tl-graph-pad,0px)]");
    // Le choix est gardé pour la prochaine ouverture.
    expect(window.localStorage.getItem("wvlds:timeline-suite-style")).toBe("graph");
  });

  it("au survol seulement : une option du rail ; rien au repos, la chaîne survolée s'allume, le reste s'estompe", async () => {
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    await screen.findByTestId("timeline-suite-links");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Au survol seulement" }));
    expect(screen.queryByTestId("timeline-suite-links")).toBeNull();
    expect(memoire.get("wvlds:timeline-suite-hover")).toBe("1");

    await user.hover(screen.getByRole("button", { name: /Les digues cèdent/ }));
    const calque = await screen.findByTestId("timeline-suite-links");
    expect(calque).toHaveAttribute("data-style", "rail");
    expect(calque.querySelector("[data-suite='a>b>c']")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Hors chaîne/ }).closest("li")!.className).toContain("opacity-30");
    expect(screen.getByRole("button", { name: /La grande crue/ }).closest("li")!.className).not.toContain("opacity-30");
  });

  it("au survol seulement avec le graphe : la place des couloirs reste réservée", async () => {
    memoire.set("wvlds:timeline-suite-style", "graph");
    memoire.set("wvlds:timeline-suite-hover", "1");
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    const user = userEvent.setup();
    const liste = await vi.waitFor(() => {
      const l = document.querySelector("[data-suite-style='graph'] ol") as HTMLElement | null;
      expect(l).not.toBeNull();
      expect(parseFloat(l!.style.getPropertyValue("--tl-graph-pad"))).toBeGreaterThan(0);
      return l!;
    });
    // Rien au repos, mais les titres ne bougeront pas au survol.
    expect(screen.queryByTestId("timeline-suite-links")).toBeNull();
    const avant = liste.style.getPropertyValue("--tl-graph-pad");
    await user.hover(screen.getByRole("button", { name: /Ce que charrie l'eau/ }));
    expect((await screen.findByTestId("timeline-suite-links"))).toHaveAttribute("data-style", "graph");
    expect(liste.style.getPropertyValue("--tl-graph-pad")).toBe(avant);
  });

  it("au survol seulement, un seul couloir est réservé, quel que soit le nombre de chaînes", async () => {
    memoire.set("wvlds:timeline-suite-style", "graph");
    // Deux chaînes : a → b → c et z → y.
    db.tables.chatrooms = [
      ...CHAINE,
      { id: "z", arc_id: null, previous_chatroom_id: null, category_id: null },
      { id: "y", arc_id: null, previous_chatroom_id: "z", category_id: null },
    ];
    const salons = [...SALONS(), room("y", "Suite hors chaîne", 3, 2, 1)];
    const { unmount } = frise(salons);
    const padDe = async () => {
      const l = await vi.waitFor(() => {
        const el = document.querySelector("[data-suite-style='graph'] ol") as HTMLElement | null;
        expect(el).not.toBeNull();
        expect(parseFloat(el!.style.getPropertyValue("--tl-graph-pad"))).toBeGreaterThan(0);
        return el!;
      });
      return parseFloat(l.style.getPropertyValue("--tl-graph-pad"));
    };
    // Toujours tracées : autant de couloirs que de chaînes qui se chevauchent.
    const toujours = await padDe();
    unmount();

    memoire.set("wvlds:timeline-suite-hover", "1");
    frise(salons);
    const survol = await padDe();
    // Un seul couloir : la place d'origine, sans les couloirs suivants.
    expect(survol).toBeLessThan(toujours);
    expect(survol).toBe(14 + 10);
  });

  it("deux styles seulement : rail continu et graphe", async () => {
    db.tables.chatrooms = CHAINE;
    frise(SALONS());
    await screen.findByTestId("timeline-suite-links");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    const styles = await screen.findByRole("combobox", { name: "Style des suites" });
    expect([...(styles as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Rail continu", "Graphe à côté du fil"]);
    expect(screen.queryByRole("checkbox", { name: "Pointillés fléchés" })).toBeNull();
  });
});
