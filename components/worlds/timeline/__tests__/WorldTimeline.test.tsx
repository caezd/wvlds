import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  /** Les salons datés du monde (ceux que `frise` monte). */
  rooms: [] as { id: string; title: string | null; name: string | null; timeline_date: unknown }[],
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order", "in", "is", "limit", "single", "maybeSingle"]) b[m] = () => b;
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
/** Un lien de suite (migration 194) : `to` suit `from`. */
function suite(from: string, to: string, status: "accepted" | "pending" = "accepted", by: string | null = null) {
  return { id: `${from}>${to}`, chatroom_id: to, previous_id: from, status, creator: by ? { username: by } : null };
}
function ouvreurs(rows: OpenerRow[]) {
  db.rpcs.get_chatroom_openers = { data: rows, error: null };
}
/**
 * La réponse de `get_world_timeline` (migration 198), composée des mêmes
 * données de test que les anciennes requêtes séparées : les salons montés,
 * leurs liens (table chatrooms), qui les a ouverts, leurs personas, les
 * événements, arcs, catégories, suites, salons où l'on joue et journaux.
 */
type Row = Record<string, unknown>;
function timelinePayload(args: { p_with_journals?: boolean }) {
  const rows = (name: string) => ((db.rpcs[name]?.data ?? []) as Row[]);
  const meta = new Map(((db.tables.chatrooms ?? []) as Row[]).map((r) => [r.id as string, r]));
  const openers = new Map(rows("get_chatroom_openers").map((r) => [r.chat_id as string, r]));
  const personaRows = rows("get_chatroom_personas");
  const personas = new Map(personaRows.map((r) => [r.persona_id as string, { id: r.persona_id, name: r.persona_name, color: r.group_color }]));
  return {
    rooms: db.rooms.filter((r) => r.timeline_date).map((r) => {
      const m = meta.get(r.id) ?? {};
      const summary = m.summary as { last_message_at: string | null } | null | undefined;
      const o = openers.get(r.id);
      return {
        id: r.id, title: r.title, name: r.name, timeline_date: r.timeline_date,
        arc_id: m.arc_id ?? null, category_id: m.category_id ?? null, status: m.status ?? "active",
        last_activity: summary?.last_message_at ?? m.created_at ?? null,
        opener_name: o?.author_name ?? null, opener_persona: o?.persona_name ?? null, opener_color: o?.group_color ?? null,
        persona_ids: personaRows.filter((p) => p.chat_id === r.id).map((p) => p.persona_id),
      };
    }),
    personas: [...personas.values()],
    events: ((db.tables.world_timeline_events ?? []) as Row[]).map((e) => ({ end_date: null, ...e })),
    arcs: db.tables.world_timeline_arcs ?? [],
    categories: db.tables.chatroom_categories ?? [],
    sequels: ((db.tables.chatroom_sequels ?? []) as Row[]).map((q) => ({
      id: q.id, chatroom_id: q.chatroom_id, previous_id: q.previous_id, status: q.status,
      created_by_name: (q.creator as { username: string | null } | null)?.username ?? null,
    })),
    mine: rows("get_linkable_chatrooms").filter((r) => r.mine).map((r) => r.id),
    journals: args.p_with_journals
      ? ((db.tables.persona_journal_entries ?? []) as Row[]).map((j) => ({
        id: j.id, persona_id: j.persona_id, persona_name: (j.persona as { name: string } | null)?.name ?? null,
        body: j.body, timeline_date: j.timeline_date,
      }))
      : [],
  };
}

beforeEach(() => {
  db.tables = {};
  db.rpcs = {};
  db.writes = [];
  db.rooms = [];
  rpc.mockReset();
  rpc.mockImplementation((name: string, args: { p_with_journals?: boolean }) =>
    name === "get_world_timeline"
      ? Promise.resolve({ data: timelinePayload(args ?? {}), error: null })
      : Promise.resolve(db.rpcs[name] ?? { data: [], error: null }));
});

import { WorldTimeline } from "@/components/worlds/timeline/WorldTimeline";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 1,
  current_month: 1,
};

type Room = (typeof db.rooms)[number];
const room = (id: string, title: string | null, year: number, month: number | null, day: number | null): Room => ({
  id, title, name: null, timeline_date: { year, month, day },
});

/** Monte la frise sur ces salons, et attend sa première réponse (le squelette
 *  tient la place d'ici là). */
async function frise(rooms: Room[], config = CONFIG, props: Partial<React.ComponentProps<typeof WorldTimeline>> = {}) {
  db.rooms = rooms;
  const rendu = render(<WorldTimeline worldId="w1" config={config} {...props} />);
  await vi.waitFor(() => expect(screen.queryByTestId("timeline-loading")).toBeNull());
  return rendu;
}

const annees = () => screen.getAllByRole("heading", { level: 3 });
/** Les bandeaux d'année, qui portent son titre. */
const bandeaux = () => screen.getAllByTestId("timeline-year-band");

describe("WorldTimeline — frise verticale", () => {
  it("affiche « Chronologie » dans l'en-tête, sans bouton « Fermer »", async () => {
    await frise([]);
    expect(screen.getByText("Chronologie")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  });

  it("affiche un message quand aucune conversation n'est encore située", async () => {
    await frise([]);
    expect(screen.getByText(/Aucune conversation/)).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-now")).toBeNull();
  });

  it("une section par année, dans l'ordre, les salons triés par mois puis jour", async () => {
    await frise([room("c", "Retour", 3, 0, 4), room("b", "Suite", 1, 2, 2), room("a", "Prologue", 1, 0, 9)]);

    expect(annees().map((h) => h.textContent)).toEqual(["An 1", "An 3"]);
    const an1 = annees()[0].closest("li")!;
    const titres = within(an1).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(titres).toEqual(["Prologue, 9 Janvier, An 1", "Suite, 2 Mars, An 1"]);
  });

  it("un anneau par salon sur le fil, le jour à gauche du fil, sans le mois", async () => {
    await frise([room("a", "Prologue", 1, 1, 19), room("b", "Une année entière", 3, null, null)]);
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

  it("les salons d'une même date : chacun son anneau, le jour une seule fois", async () => {
    await frise([
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
    // pour la première date de l'année, sur la bordure de l'année.
    expect(within(mars).getByTestId("timeline-month-label")).toHaveTextContent("Mars");
    expect(within(neufJanvier).queryByTestId("timeline-first-month")).toBeNull();
    const an2 = neufJanvier.closest("[data-year]") as HTMLElement;
    expect(within(an2).getByTestId("timeline-first-month")).toHaveTextContent("Janvier");
    // Plus de branche.
    expect(screen.queryByTestId("timeline-branch")).toBeNull();
  });

  it("l'année, un bandeau sur toute la largeur : le chiffre en gras, sans pastille ni rouge", async () => {
    await frise([room("a", "Prologue", 1, 0, 1)], { ...CONFIG, era_name: "des Cendres" });
    const titre = annees()[0];
    expect(titre.textContent).toBe("An 1 des Cendres");
    const bandeau = bandeaux()[0];
    expect(bandeau).toContainElement(titre);
    // Le chiffre en gras, sans pastille ; sa légende appuyée.
    const chiffre = within(titre).getByTestId("timeline-year-number");
    expect(chiffre).toHaveTextContent("1");
    expect(chiffre.className.split(" ")).toEqual(expect.arrayContaining(["font-bold", "text-foreground"]));
    expect(chiffre.className).not.toMatch(/rounded|bg-/);
    expect(within(titre).getByText("An").className.split(" ")).toEqual(expect.arrayContaining(["font-semibold", "text-foreground/60"]));
    expect(bandeau.innerHTML).not.toMatch(/accent|red/);
    // D'un bord à l'autre du conteneur, marges de la liste comprises.
    expect(bandeau.className.split(" ")).toEqual(expect.arrayContaining(["-ml-5", "-mr-[var(--tl-right-pad,20px)]", "px-5"]));
    // Plus de réglette des mois.
    expect(screen.queryByTestId("timeline-month-ruler")).toBeNull();
    expect(bandeau.querySelector("button")).toBeNull();
  });

  it("le bandeau de l'année sépare les années, sous les lignes de suite, sans le fil ; il ne se colle plus", async () => {
    db.tables.chatroom_sequels = [suite("a", "b")];
    await frise([room("a", "Prologue", 1, 0, 1), room("b", "Suite", 1, 0, 2)]);
    const bandeau = bandeaux()[0];
    // Où l'on en est se lit dans le bandeau de position, collé dans la tête.
    expect(bandeau.className.split(" ")).not.toContain("sticky");
    expect(bandeau).not.toHaveAttribute("data-stuck");
    // Transparent et sous les lignes de suite (z-[2]) : elles le traversent.
    expect(bandeau.className.split(" ")).toEqual(expect.arrayContaining(["relative", "z-[1]"]));
    expect((await screen.findByTestId("timeline-suite-links")).getAttribute("class")!.split(" ")).toContain("z-[2]");
    expect(bandeau.className).not.toMatch(/(^|\s)(lg:)?bg-/);
    // Le fil ne le traverse pas.
    expect(bandeau.querySelector(".w-px")).toBeNull();
    // La tête et le bandeau de position restent hors de la zone qui défile.
    const zone = screen.getByTestId("timeline-scroll");
    expect(zone).not.toContainElement(screen.getByTestId("timeline-head"));
    expect(zone).not.toContainElement(screen.getByTestId("timeline-position"));
    // Bordé dessus et dessous.
    expect(screen.getByTestId("timeline-position").className.split(" ")).toEqual(expect.arrayContaining(["border-y", "border-border"]));
  });

  it("le bandeau de position suit le défilement : l'année, le mois passé sous la tête, ses salons ; les flèches mènent au mois voisin", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Départ", 1, 0, 1), room("b", "Retour", 1, 2, 1), room("b2", "Et encore", 1, 2, 9), room("c", "Plus tard", 2, 0, 1)]);
    const scroll = screen.getByTestId("timeline-scroll");
    const rect = (top: number, bottom = top + 20) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    const place = (el: Element, top: number, bottom?: number) => { (el as HTMLElement).getBoundingClientRect = () => rect(top, bottom); };
    // La tête mesure 0 sous jsdom : le seuil est le haut du défilement (100) + 8.
    place(scroll, 100, 600);
    const [an1, an2] = bandeaux().map((b) => b.closest("[data-year]")!);
    place(an1, 40, 300);
    place(an2, 300, 800);
    // Janvier, puis les deux dates de mars.
    const [janvier, mars, mars9] = an1.querySelectorAll("[data-date-group]");
    place(janvier, 60);
    place(mars, 200);
    place(mars9, 240);
    fireEvent.scroll(scroll);
    const position = screen.getByTestId("timeline-position");
    expect(within(position).getByTestId("timeline-position-label")).toHaveTextContent("An 1Janvier1 salon");

    // Mars passe sous la tête.
    place(mars, 90);
    fireEvent.scroll(scroll);
    expect(within(position).getByTestId("timeline-position-label")).toHaveTextContent("An 1Mars2 salons");

    // « Mois suivant » : défile jusqu'au mois d'après (janvier de l'an 2).
    const scrollTo = vi.fn();
    scroll.scrollTo = scrollTo as never;
    await user.click(within(position).getByRole("button", { name: "Mois suivant" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 200, behavior: "smooth" });
    expect(within(position).getByRole("button", { name: "Mois précédent" })).toBeEnabled();
  });

  it("les puces des arcs : ceux du mois en cours d'abord ; au survol d'un salon, son arc en tête et en pastille", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_arcs = [
      { id: "exil", name: "L'exil", color: "#22c55e", position: 0 },
      { id: "sacre", name: "Le sacre", color: "#ef4444", position: 1 },
    ];
    db.tables.chatrooms = [
      { id: "a", arc_id: "sacre", category_id: null },
      { id: "b", arc_id: "exil", category_id: null },
      { id: "c", arc_id: "sacre", category_id: null },
    ];
    await frise([room("b", "Retour", 1, 0, 1), room("a", "Départ", 2, 0, 1), room("c", "Sacre", 2, 0, 4)]);
    const scroll = screen.getByTestId("timeline-scroll");
    const rect = (top: number, bottom = top + 20) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    scroll.getBoundingClientRect = () => rect(100, 600);
    const [an1, an2] = bandeaux().map((b) => b.closest("[data-year]") as HTMLElement);
    an1.getBoundingClientRect = () => rect(40, 300);
    an2.getBoundingClientRect = () => rect(300, 800);
    fireEvent.scroll(scroll);

    const puces = () => [...screen.getByTestId("timeline-arc-dots").querySelectorAll<HTMLElement>("[data-arc-dot]")];
    // An 1, janvier : l'exil en tête, seul net.
    expect(puces().map((p) => p.dataset.arcDot)).toEqual(["exil", "sacre"]);
    expect(puces().map((p) => !!p.dataset.bright)).toEqual([true, false]);
    expect(screen.queryByTestId("timeline-hovered-arc")).toBeNull();

    // Survol d'un salon du sacre : son arc passe en tête, et sa pastille paraît.
    await user.hover(screen.getByRole("button", { name: /^Départ/ }));
    expect(puces().map((p) => p.dataset.arcDot)).toEqual(["sacre", "exil"]);
    expect(puces().map((p) => !!p.dataset.bright)).toEqual([true, false]);
    expect(screen.getByTestId("timeline-hovered-arc")).toHaveTextContent("Le sacre2 épisodes");
  });

  it("la mini-carte couvre toute la frise ; un clic sur un mois défile jusqu'à sa première date ; le mois lu y ressort", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Départ", 1, 0, 1), room("b", "Retour", 1, 2, 1), room("c", "Plus tard", 2, 0, 1)]);
    const carte = screen.getByRole("navigation", { name: "Aperçu de la frise" });
    // Deux années, trois mois chacune (le calendrier du monde).
    expect(within(carte).getAllByRole("button", { name: /^(Janvier|Février|Mars), An/ })).toHaveLength(6);

    const scroll = screen.getByTestId("timeline-scroll");
    const rect = (top: number, bottom = top + 20) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    const place = (el: Element, top: number, bottom?: number) => { (el as HTMLElement).getBoundingClientRect = () => rect(top, bottom); };
    place(scroll, 100, 600);
    const an1 = document.querySelector("[data-year='1']")!;
    place(an1, 40, 300);
    place(document.querySelector("[data-year='2']")!, 300, 800);
    const [janvier, mars] = an1.querySelectorAll("[data-date-group]");
    place(janvier, 60);
    place(mars, 250);
    fireEvent.scroll(scroll);
    expect(within(carte).getByRole("button", { name: "Janvier, An 1 · 1 salon" })).toHaveAttribute("aria-current", "true");

    // Mars de l'an 1 : jusqu'à sa première date, sous la tête (0 sous jsdom).
    const scrollTo = vi.fn();
    scroll.scrollTo = scrollTo as never;
    await user.click(within(carte).getByRole("button", { name: "Mars, An 1 · 1 salon" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: "smooth" });

    // Mars passe sous la tête : la mini-carte suit.
    place(mars, 90);
    fireEvent.scroll(scroll);
    expect(within(carte).getByRole("button", { name: "Mars, An 1 · 1 salon" })).toHaveAttribute("aria-current", "true");
    expect(within(carte).getByRole("button", { name: "Janvier, An 1 · 1 salon" })).not.toHaveAttribute("aria-current");
  });

  it("le titre d'un salon ouvre son aperçu au survol, après un court délai", async () => {
    const user = userEvent.setup();
    db.tables.chat_messages = [{ content: "Ne me mens pas.", created_at: new Date().toISOString() }];
    await frise([room("a", "Départ", 1, 0, 1)]);
    const titre = screen.getByRole("button", { name: /^Départ/ });
    // Déclencheur de la carte de survol (Radix), fermée au repos.
    expect(titre).toHaveAttribute("data-state", "closed");
    await user.hover(titre);
    expect(await screen.findByText("« Ne me mens pas. »", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("l'en-tête résume la frise ; « Aujourd'hui » ramène à la date actuelle ; la légende des marques", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_arcs = [{ id: "exil", name: "L'exil", color: "#22c55e", position: 0 }];
    await frise([room("a", "Départ", 1, 0, 1), room("b", "Retour", 1, 2, 1)]);
    expect(screen.getByTestId("timeline-summary")).toHaveTextContent("2 salons · 1 arc");
    const legende = screen.getByRole("list", { name: "Légende" });
    expect(within(legende).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "En cours", "En sommeil", "Terminé", "Abandonné", "Événement",
    ]);
    const scroll = screen.getByTestId("timeline-scroll");
    const scrollTo = vi.fn();
    scroll.scrollTo = scrollTo as never;
    const aujourdhui = screen.getByRole("button", { name: "Aujourd’hui" });
    // Arrondi comme les autres boutons de la tête.
    expect(aujourdhui.className.split(" ")).toContain("rounded-md");
    await user.click(aujourdhui);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("le premier mois de l'année, sous le bandeau, calé sur le jour", async () => {
    await frise([room("a", "Prologue", 1, 0, 3), room("b", "Sans mois", 2, null, null)]);
    const [an1, an2] = annees().map((h) => h.closest("[data-year]") as HTMLElement);
    const mois = within(an1).getByTestId("timeline-first-month");
    expect(mois).toHaveTextContent("Janvier");
    // Le texte finit 0.75rem avant le fil, comme le jour.
    expect(mois.className.split(" ")).toEqual(
      expect.arrayContaining(["top-3", "right-[calc(100%+0.25rem)]", "px-2", "text-right", "uppercase"]),
    );
    // 32px sous le bandeau avant la première date.
    expect((mois.parentElement as HTMLElement).className.split(" ")).toContain("py-8");
    // Une année sans mois n'en affiche pas.
    expect(within(an2).queryByTestId("timeline-first-month")).toBeNull();
  });

  it("des bandeaux bordés dessus et dessous de la couleur des bordures, sans trait au-dessus du tout premier", async () => {
    await frise([room("a", "Avant", 0, 0, 1), room("b", "Après", 1, 0, 1)]);
    for (const bandeau of bandeaux()) {
      const classes = bandeau.className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["border-y", "border-border", "[li:first-child>&]:border-t-0"]));
    }
  });

  it("un filet sépare chaque mois d'une année, pas les salons d'un même mois", async () => {
    await frise([
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
    // Autant d'air de part et d'autre du filet : 32px au-dessus (16 de
    // space-y + top-4), 32px dessous (pt-12 − top-4). En padding : une marge
    // haute fusionnait avec la marge basse de la date précédente.
    expect(ligne("Trois mars").className.split(" ")).toContain("pt-12");
    expect(ligne("Trois mars").className).not.toMatch(/(^|\s)mt-/);
    expect(within(ligne("Trois mars") as HTMLElement).getByTestId("timeline-month-rule").className.split(" ")).toContain("top-4");
    // Un filet en pointillés, d'un bord à l'autre du conteneur : colonne des
    // années et marge des suites comprises.
    const filet = within(ligne("Trois mars") as HTMLElement).getByTestId("timeline-month-rule");
    expect(filet.className.split(" ")).toEqual(expect.arrayContaining([
      "border-dashed", "border-border", "-left-[9rem]", "-right-[var(--tl-right-pad,20px)]",
    ]));
    // Le nom du nouveau mois — un seul ici.
    const noms = screen.getAllByTestId("timeline-month-label");
    expect(noms.map((l) => l.textContent)).toEqual(["Mars"]);
    // Posé sur le filet (centré sur lui, fond qui le découpe), en capitales.
    expect(noms[0].className.split(" ")).toEqual(
      expect.arrayContaining(["top-4", "-translate-y-1/2", "bg-body", "uppercase"]),
    );
    // À gauche du fil, calé à droite sur le jour : le texte finit au même
    // retrait (2rem + px-2 = 2.5rem, celui du jour).
    expect(noms[0].className.split(" ")).toEqual(expect.arrayContaining(["right-[calc(100%+2rem)]", "px-2", "text-right"]));
    expect(screen.getAllByTestId("timeline-day")[0].className).toContain("right-[calc(100%+2.5rem)]");
    expect(noms[0].className).not.toContain("--tl-graph-pad");
    expect(ligne("Autre année")).not.toHaveAttribute("data-new-month");
  });

  it("le jour et le mois de chaque salon, sans couleur d'accent", async () => {
    await frise([room("a", "Prologue", 1, 1, 19)]);
    const ligne = screen.getByRole("button", { name: /Prologue/ });
    expect(ligne.innerHTML).not.toMatch(/accent|red-600/);
  });

  it("la date actuelle du monde se glisse parmi les salons, à son mois", async () => {
    await frise([room("a", "Janvier", 1, 0, 3), room("b", "Mars", 1, 2, 3)]);
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

  it("l'année actuelle a sa section même sans salon, pour porter son repère", async () => {
    await frise([room("a", "Jadis", 0, 0, 1)], { ...CONFIG, current_year: 4 });
    expect(annees().map((h) => h.textContent)).toEqual(["An 0", "An 4"]);
    expect(screen.getByTestId("timeline-now")).toBeInTheDocument();
  });

  it("au-delà de cinq ans, des pastilles mènent à chaque tranche", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 12, 0, 1)], { ...CONFIG, current_year: 12 });

    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    const pastilles = within(nav).getAllByRole("button");
    // Nommées par leur tranche ; la courante porte en plus son nombre de salons.
    expect(pastilles.map((p) => p.textContent)).toEqual(["1 – 5", "11 – 151"]);
    expect(within(nav).getByRole("button", { name: "11 – 15" })).toBe(pastilles[1]);
    // Ouverte sur l'année actuelle : sa tranche est la courante.
    expect(pastilles[1]).toHaveAttribute("aria-current", "true");

    await user.click(pastilles[0]);
    expect(pastilles[0]).toHaveAttribute("aria-current", "true");
    expect(pastilles[1]).not.toHaveAttribute("aria-current");
  });

  it("sur cinq ans ou moins, pas de pastilles", async () => {
    await frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 3, 0, 1)]);
    expect(screen.queryByRole("navigation", { name: "Périodes de la chronologie" })).toBeNull();
  });

  it("ouvrir un salon depuis la frise", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Prologue", 1, 0, 1)]);
    await user.click(screen.getByRole("button", { name: /Prologue/ }));
    expect(push).toHaveBeenCalledWith("/c/a");
  });
});

describe("WorldTimeline — lignes de salon", () => {
  it("survol discret, et un libellé par défaut sans titre", async () => {
    await frise([room("a", "Prologue", 1, 1, 19), room("b", null, 1, 1, null)]);

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
    await frise([room("a", "Prologue", 1, 0, 6)]);

    const par = await screen.findByTestId("timeline-opener");
    expect(par.textContent).toBe("par Tess (@Poumon)");
    expect(within(par).getByText("Tess")).toHaveStyle({ color: "#ef4444" });
    // Tout vient d'une seule requête, sans journaux quand le monde les cache.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_world_timeline", { p_world_id: "w1", p_with_journals: false });
    // Lu en entier par les lecteurs d'écran.
    expect(screen.getByRole("button", { name: "Prologue, par Tess (@Poumon), 6 Janvier, An 1" })).toBeInTheDocument();
  });

  it("sans persona (salon encore vide), « par @pseudo » ; persona sans groupe, sans couleur", async () => {
    ouvreurs([
      { chat_id: "a", author_name: "Proprio", persona_name: null, group_color: null },
      { chat_id: "b", author_name: "Poumon", persona_name: "Isolé", group_color: null },
    ]);
    await frise([room("a", "Prologue", 1, 0, 6), room("b", "Suite", 1, 0, 7)]);

    const [vide, sansGroupe] = await screen.findAllByTestId("timeline-opener");
    expect(vide.textContent).toBe("par @Proprio");
    expect(within(vide).getByText("@Proprio").getAttribute("style")).toBeNull();
    expect(sansGroupe.textContent).toBe("par Isolé (@Poumon)");
    expect(within(sansGroupe).getByText("Isolé").getAttribute("style")).toBeNull();
  });

  it("une erreur de chargement laisse la frise intacte, sans « par … »", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    db.rpcs.get_chatroom_openers = { data: null, error: { message: "boom" } };
    await frise([room("a", "Prologue", 1, 0, 6)]);

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

  it("anneaux, nom du mois et barre des périodes suivent le fond de la page", async () => {
    await frise([room("a", "Début", 1, 0, 1), room("b", "Mars", 1, 2, 1), room("c", "Fin", 12, 0, 1)], { ...CONFIG, current_year: 12 });
    for (const anneau of screen.getAllByTestId("timeline-ring")) ambiant(anneau);
    ambiant(screen.getByTestId("timeline-month-label"));
    // La tête (recherche, filtres, périodes) ne défile pas : ni collée, ni fond à elle.
    const tete = screen.getByTestId("timeline-head");
    expect(tete).toContainElement(screen.getByRole("navigation", { name: "Périodes de la chronologie" }));
    expect(tete.className).not.toMatch(/sticky|(^|\s)(lg:)?bg-/);
  });
});

describe("WorldTimeline — événements, journaux, arcs, suites", () => {
  it("un événement : un losange sur le fil, son texte, sa page du wiki", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_events = [{
      id: "e1", title: "Couronnement", description: "La reine est sacrée.", timeline_date: { year: 1, month: 0, day: 6 },
      wiki_page_id: "p1", wiki_page: { slug: "reine", title: "La reine" },
    }];
    await frise([room("a", "Prologue", 1, 0, 6)]);

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
    await frise([room("a", "Prologue", 1, 0, 6)], CONFIG, { canManage: true });
    // Chargé et monté à la première ouverture seulement.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Nouvel événement")).toBeNull();

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

  it("sans la permission, ni ajout d'événement ni arcs", async () => {
    await frise([room("a", "Prologue", 1, 0, 6)]);
    expect(screen.queryByRole("button", { name: /^Événement$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Arcs$/ })).toBeNull();
  });

  it("les journaux : seulement si le monde les montre", async () => {
    db.tables.persona_journal_entries = [{
      id: "j1", persona_id: "p-tess", body: "Une nuit sans lune.", timeline_date: { year: 1, month: 0, day: 6 }, persona: { name: "Tess" },
    }];
    const { unmount } = await frise([room("a", "Prologue", 1, 0, 6)]);
    await screen.findByText("Prologue");
    expect(screen.queryByText("Journal de Tess")).toBeNull();
    unmount();

    await frise([room("a", "Prologue", 1, 0, 6)], { ...CONFIG, show_journals: true });
    expect(await screen.findByText("Journal de Tess")).toBeInTheDocument();
    expect(screen.getByText("Une nuit sans lune.")).toBeInTheDocument();
  });

  it("un arc teinte l'anneau et s'affiche après le titre", async () => {
    db.tables.world_timeline_arcs = [{ id: "arc", name: "L'exil", color: "#22c55e", position: 0 }];
    db.tables.chatrooms = [{ id: "a", arc_id: "arc", category_id: null }];
    await frise([room("a", "Exil à l'est", 1, 0, 6)]);

    const etiquette = await screen.findByTestId("timeline-arc");
    expect(etiquette).toHaveTextContent("L'exil");
    const salon = etiquette.closest("li")!;
    expect(within(salon).getByTestId("timeline-ring")).toHaveStyle({ borderColor: "#22c55e" });
    // Sans suite, pas un épisode : la couleur de l'arc, sans numéro.
    const bouton = screen.getByRole("button", { name: "Exil à l'est, arc L'exil, 6 Janvier, An 1" });
    expect(within(bouton).queryByTestId("timeline-arc-rank")).toBeNull();
  });

  it("le rang du salon dans son arc, avant le titre, stable quand on filtre", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_arcs = [{ id: "arc", name: "L'exil", color: "#22c55e", position: 0 }];
    db.tables.chatrooms = [
      { id: "a", arc_id: "arc", category_id: null },
      { id: "b", arc_id: "arc", category_id: null },
      { id: "c", arc_id: null, category_id: null },
    ];
    db.tables.chatroom_sequels = [suite("a", "b")];
    await frise([room("a", "Le départ", 1, 0, 6), room("b", "La frontière", 2, 0, 1), room("c", "Hors arc", 2, 1, 1)]);

    const depart = await screen.findByRole("button", { name: "Le départ, arc L'exil, n° 1, 6 Janvier, An 1" });
    expect(within(depart).getByTestId("timeline-arc-rank")).toHaveTextContent("1.");
    expect(within(depart).getByTestId("timeline-arc-rank")).toHaveStyle({ color: "#22c55e" });
    // Avant le titre.
    const rang = within(depart).getByTestId("timeline-arc-rank");
    expect(rang.compareDocumentPosition(within(depart).getByText("Le départ")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /La frontière/ })).getByTestId("timeline-arc-rank")).toHaveTextContent("2.");
    expect(within(screen.getByRole("button", { name: /Hors arc/ })).queryByTestId("timeline-arc-rank")).toBeNull();

    // Filtré, le second salon garde son rang.
    await user.type(screen.getByRole("searchbox"), "frontière");
    expect(within(screen.getByRole("button", { name: /La frontière/ })).getByTestId("timeline-arc-rank")).toHaveTextContent("2.");
  });

  it("une suite se relie d'une ligne quand les deux salons sont à l'écran", async () => {
    db.tables.chatroom_sequels = [suite("a", "b")];
    await frise([room("a", "La grande crue", 1, 0, 6), room("b", "Les digues cèdent", 3, 0, 1)]);
    const liens = await screen.findByTestId("timeline-suite-links");
    expect(liens.querySelector("[data-suite='a>b']")).not.toBeNull();
  });
});

describe("WorldTimeline — recherche et filtres", () => {
  it("la recherche ne garde que ce qui correspond, sans tenir compte des accents", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Le siège de Vaudrel", 1, 0, 6), room("b", "La comète", 1, 2, 1)]);
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
    await frise([room("a", "Avec Tess", 1, 0, 6), room("b", "Avec Ivo", 1, 2, 1)]);

    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Persona présent" }), "Tess");
    expect(screen.getByText("Avec Tess")).toBeInTheDocument();
    expect(screen.queryByText("Avec Ivo")).toBeNull();
    expect(screen.getByTestId("timeline-filters-count")).toHaveTextContent("1");
  });
});

describe("WorldTimeline — événements qui durent, fêtes, statut des salons", () => {
  it("un événement qui dure : sa fin à sa date, et une barre de l'un à l'autre", async () => {
    db.tables.world_timeline_events = [{
      id: "e1", title: "Le siège", description: null, timeline_date: { year: 1, month: 0, day: 6 },
      end_date: { year: 2, month: 2, day: 12 }, wiki_page_id: null, wiki_page: null,
    }];
    await frise([room("a", "Prologue", 1, 0, 6)]);
    const evenement = (await screen.findByText("Le siège")).closest("[data-event-id]") as HTMLElement;
    // Une carte ; sa fin en pastille à côté du titre.
    expect(within(evenement).getByTestId("timeline-event-card")).toBeInTheDocument();
    expect(within(evenement).getByTestId("timeline-event-until")).toHaveTextContent("jusqu’à 12 Mars, An 2");
    // La fin paraît à sa date, dans une année qui n'a rien d'autre.
    const fin = screen.getByText("Fin : Le siège").closest("[data-event-end-id]") as HTMLElement;
    expect(fin).toHaveAttribute("data-event-end-id", "e1");
    expect(fin.closest("[data-year]")).toHaveAttribute("data-year", "2");
    expect(within(fin).getByTestId("timeline-day")).toHaveTextContent("12");
    // La barre de durée, de l'événement à sa fin.
    const barres = await screen.findByTestId("timeline-event-spans");
    expect(barres.querySelector("[data-event-span='e1']")).not.toBeNull();
  });

  it("un jalon n'a pas de « jusqu'à », et la carte ne porte pas les arcs", async () => {
    db.tables.world_timeline_arcs = [{ id: "exil", name: "L'exil", color: "#22c55e", position: 0 }];
    db.tables.chatrooms = [{ id: "a", arc_id: "exil", category_id: null }, { id: "b", arc_id: "exil", category_id: null }];
    db.tables.world_timeline_events = [{
      id: "e1", title: "La comète", description: null, timeline_date: { year: 1, month: 1, day: 3 },
      end_date: null, wiki_page_id: null, wiki_page: null,
    }];
    await frise([room("a", "Départ", 1, 0, 6), room("b", "Retour", 1, 2, 1)]);
    const evenement = (await screen.findByText("La comète")).closest("[data-event-id]") as HTMLElement;
    expect(within(evenement).getByTestId("timeline-event-card")).toBeInTheDocument();
    expect(within(evenement).queryByTestId("timeline-event-until")).toBeNull();
    expect(evenement.querySelector("[title], [data-arc-dot]")).toBeNull();
  });

  it("pendant ce temps : au survol d'un événement qui dure, ce qui se passe pendant reste net, le reste s'estompe", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_events = [
      {
        id: "e1", title: "L'hiver", description: null, timeline_date: { year: 1, month: 1, day: 1 },
        end_date: { year: 2, month: 0, day: 15 }, wiki_page_id: null, wiki_page: null,
      },
      {
        id: "e2", title: "Le sacre", description: null, timeline_date: { year: 3, month: 0, day: 1 },
        end_date: null, wiki_page_id: null, wiki_page: null,
      },
    ];
    await frise([
      room("avant", "Avant", 1, 0, 6),
      room("pendant", "Pendant", 1, 2, 1),
      room("flou", "Un jour de l'an 2", 2, null, null),
      room("apres", "Après", 2, 2, 1),
    ]);
    const hiver = (await screen.findByText("L'hiver")).closest("[data-event-id]") as HTMLElement;
    const ligne = (id: string) => document.querySelector(`[data-room-id='${id}']`) as HTMLElement;
    const estompe = (el: Element) => el.className.split(" ").includes("opacity-30");

    await user.hover(hiver);
    // Pendant : net ; une date « an 2 » tombe pendant un hiver qui finit en l'an 2.
    expect(estompe(ligne("pendant"))).toBe(false);
    expect(estompe(ligne("flou"))).toBe(false);
    expect(estompe(hiver)).toBe(false);
    expect(estompe(document.querySelector("[data-event-end-id='e1']")!)).toBe(false);
    // Avant et après : estompés.
    expect(estompe(ligne("avant"))).toBe(true);
    expect(estompe(ligne("apres"))).toBe(true);
    // Sa barre ressort.
    expect(document.querySelector("[data-event-span='e1']")).toHaveAttribute("data-active", "true");

    // La fin aussi déclenche ; un événement sans durée, non.
    await user.hover(document.querySelector("[data-event-end-id='e1']")!);
    expect(estompe(ligne("avant"))).toBe(true);
    await user.hover(screen.getByText("Le sacre"));
    expect(estompe(ligne("avant"))).toBe(false);
    await user.unhover(screen.getByText("Le sacre"));
  });

  it("des durées qui se chevauchent écartent les titres pour loger leurs barres, même en rail", async () => {
    const duree = (id: string, from: number, to: number) => ({
      id, title: id, description: null, timeline_date: { year: 1, month: from, day: 1 },
      end_date: { year: 1, month: to, day: 1 }, wiki_page_id: null, wiki_page: null,
    });
    db.tables.world_timeline_events = [duree("e1", 0, 2), duree("e2", 0, 2), duree("e3", 1, 2)];
    await frise([room("a", "Prologue", 1, 0, 6)]);
    const liste = () => document.querySelector("[data-suite-style] ol") as HTMLElement;
    // Trois barres côte à côte : 2 × 6 − 2 = 10px de plus avant les titres.
    await vi.waitFor(() => expect(liste().style.getPropertyValue("--tl-graph-pad")).toBe("10px"));
  });

  it("filtrer les événements cache aussi leur fin et leur barre", async () => {
    const user = userEvent.setup();
    db.tables.world_timeline_events = [{
      id: "e1", title: "Le siège", description: null, timeline_date: { year: 1, month: 0, day: 6 },
      end_date: { year: 2, month: 2, day: 12 }, wiki_page_id: null, wiki_page: null,
    }];
    await frise([room("a", "Prologue", 1, 0, 6)]);
    await screen.findByText("Fin : Le siège");
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Événements" }));
    expect(screen.queryByText("Fin : Le siège")).toBeNull();
    expect(screen.queryByTestId("timeline-event-spans")).toBeNull();
  });

  it("les fêtes du calendrier, seulement dans les mois qui ont une entrée ; cachées d'une case", async () => {
    const user = userEvent.setup();
    await frise(
      [room("a", "Prologue", 1, 1, 6), room("b", "Épilogue", 3, 1, 20), room("c", "Ailleurs", 4, 2, 1), room("d", "Sans mois", 5, null, null)],
      { ...CONFIG, holidays: [{ name: "Fête des lanternes", month: 1, day: 9 }] },
    );
    const fetes = screen.getAllByText("Fête des lanternes").map((f) => f.closest("[data-holiday-id]") as HTMLElement);
    // Février des ans 1 et 3 ; pas l'an 4 (rien en février), ni l'an 5
    // (une date sans mois n'ouvre aucun mois).
    expect(fetes.map((f) => f.closest("[data-year]")!.getAttribute("data-year"))).toEqual(["1", "3"]);
    expect(within(fetes[0]).getByTestId("timeline-day")).toHaveTextContent("9");
    expect(within(fetes[0]).getByTestId("timeline-holiday-mark")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Fêtes" }));
    expect(screen.queryByText("Fête des lanternes")).toBeNull();
  });

  it("sans fête au calendrier, pas de case « Fêtes » dans les filtres", async () => {
    const user = userEvent.setup();
    await frise([room("a", "Prologue", 1, 0, 6)]);
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await screen.findByRole("checkbox", { name: "Salons" });
    expect(screen.queryByRole("checkbox", { name: "Fêtes" })).toBeNull();
  });

  it("le statut d'un salon se lit sur son anneau ; « en sommeil » se déduit du dernier message", async () => {
    const vieux = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    db.tables.chatrooms = [
      { id: "a", arc_id: null, category_id: null, status: "active", created_at: vieux, summary: { last_message_at: recent } },
      { id: "b", arc_id: null, category_id: null, status: "active", created_at: vieux, summary: { last_message_at: vieux } },
      { id: "c", arc_id: null, category_id: null, status: "completed", created_at: vieux, summary: null },
      { id: "d", arc_id: null, category_id: null, status: "abandoned", created_at: vieux, summary: null },
    ];
    await frise([room("a", "Vivant", 1, 0, 1), room("b", "Endormi", 1, 0, 2), room("c", "Clos", 1, 0, 3), room("d", "Laissé", 1, 0, 4)]);
    const ligne = (id: string) => document.querySelector(`[data-room-id='${id}']`) as HTMLElement;
    await vi.waitFor(() => expect(ligne("b")).toHaveAttribute("data-status", "dormant"));
    expect(ligne("a")).toHaveAttribute("data-status", "active");
    expect(ligne("c")).toHaveAttribute("data-status", "completed");
    expect(ligne("d")).toHaveAttribute("data-status", "abandoned");

    const anneau = (id: string) => within(ligne(id)).getByTestId("timeline-ring");
    // En cours : creux. En sommeil : le signe pause couché (« = »), sur le
    // fond qui découpe le fil. Terminé : plein. Abandonné : en pointillés.
    // Une bordure de 2px.
    expect(anneau("a").className.split(" ")).toContain("border-2");
    expect(within(anneau("a")).queryByTestId("timeline-pause-mark")).toBeNull();
    const pause = within(anneau("b")).getByTestId("timeline-pause-mark");
    expect(pause.children).toHaveLength(2);
    expect(pause.firstElementChild!.className.split(" ")).toEqual(expect.arrayContaining(["bg-current", "h-[1.5px]"]));
    expect(anneau("b").className).toContain("bg-body");
    expect(anneau("b").getAttribute("style") ?? "").not.toMatch(/gradient/);
    expect(anneau("c").className).toContain("bg-foreground/35");
    expect(anneau("d").className.split(" ")).toContain("border-dashed");
    // Le statut est lu, sauf « en cours ».
    expect(within(ligne("d")).getByRole("button").getAttribute("aria-label")).toContain("Abandonné");
    expect(within(ligne("a")).getByRole("button").getAttribute("aria-label")).not.toMatch(/En cours/);
  });

  it("le délai du monde règle la mise en sommeil ; 0 : jamais", async () => {
    const vieux = new Date(Date.now() - 90 * 86_400_000).toISOString();
    db.tables.chatrooms = [{ id: "b", arc_id: null, category_id: null, status: "active", created_at: vieux, summary: { last_message_at: vieux } }];
    await frise([room("b", "Endormi", 1, 0, 2)], { ...CONFIG, dormant_days: 0 });
    await screen.findByText("Endormi");
    await vi.waitFor(() => expect(document.querySelector("[data-room-id='b']")).toHaveAttribute("data-status", "active"));
  });

  it("filtrer par statut", async () => {
    const user = userEvent.setup();
    db.tables.chatrooms = [
      { id: "a", arc_id: null, category_id: null, status: "completed", created_at: null, summary: null },
      { id: "b", arc_id: null, category_id: null, status: "active", created_at: null, summary: null },
    ];
    await frise([room("a", "Clos", 1, 0, 1), room("b", "Vivant", 1, 0, 2)]);
    await vi.waitFor(() => expect(document.querySelector("[data-room-id='a']")).toHaveAttribute("data-status", "completed"));
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Statut" }), "Terminé");
    expect(screen.getByText("Clos")).toBeInTheDocument();
    expect(screen.queryByText("Vivant")).toBeNull();
  });
});

describe("WorldTimeline — chargement et pagination", () => {
  // Un observateur d'intersection pilotable : jsdom n'en a pas de vrai.
  let observed: Element[] = [];
  let signal: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | null = null;
  beforeEach(() => {
    observed = [];
    signal = null;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: (entries: { target: Element; isIntersecting: boolean }[]) => void) { signal = cb; observed = []; }
      observe(el: Element) { observed.push(el); }
      disconnect() { observed = []; }
      unobserve() {}
    });
    return () => vi.unstubAllGlobals();
  });
  const approcher = (testId: string) => {
    const el = screen.getByTestId(testId);
    expect(observed).toContain(el);
    act(() => signal!([{ target: el, isIntersecting: true }]));
  };

  /** Un salon par jour, `n` jours d'affilée à partir de l'an 1, mois de 28 jours. */
  const beaucoup = (n: number) => Array.from({ length: n }, (_, i) =>
    room(`r${i}`, `Salon ${i}`, 1 + Math.floor(i / 84), Math.floor((i % 84) / 28), (i % 28) + 1));

  it("un squelette tient la place jusqu'à la réponse, puis la frise paraît d'un bloc", async () => {
    let repondre: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => { repondre = r; }));
    db.rooms = [room("a", "Prologue", 1, 0, 6)];
    render(<WorldTimeline worldId="w1" config={CONFIG} />);
    const squelette = screen.getByTestId("timeline-loading");
    expect(squelette).toHaveTextContent("Chargement de la chronologie…");
    // Dessiné comme la frise : deux bandeaux d'année bordés, le fil, un
    // anneau par date, un filet pointillé par mois qui n'ouvre pas l'année.
    expect(squelette.querySelectorAll(".border-y")).toHaveLength(2);
    expect(squelette.querySelectorAll(".w-px.bg-border")).toHaveLength(2);
    expect(squelette.querySelectorAll(".rounded-full.border-border")).toHaveLength(6);
    expect(squelette.querySelectorAll(".border-dashed")).toHaveLength(2);
    expect(screen.queryByText("Prologue")).toBeNull();
    // Pas de « rien ici » pendant le chargement.
    expect(screen.queryByText(/Aucune conversation/)).toBeNull();
    await act(async () => repondre({ data: timelinePayload({}), error: null }));
    expect(screen.queryByTestId("timeline-loading")).toBeNull();
    expect(screen.getByText("Prologue")).toBeInTheDocument();
  });

  it("une page de dates autour de l'année actuelle ; la suite se charge en approchant du bas, puis du haut", async () => {
    // 200 dates sur trois ans ; l'année actuelle, la deuxième.
    await frise(beaucoup(200), { ...CONFIG, current_year: 2 });
    const rendus = () => document.querySelectorAll("[data-room-id]").length;
    // Une page (60), ouverte un peu avant l'an 2 (dixième ligne avant lui).
    expect(rendus()).toBe(60);
    expect(screen.getByText("Salon 74")).toBeInTheDocument();
    expect(screen.queryByText("Salon 73")).toBeNull();
    expect(screen.queryByText("Salon 134")).toBeNull();

    approcher("timeline-more-after");
    expect(rendus()).toBe(120);
    expect(screen.getByText("Salon 193")).toBeInTheDocument();

    // Vers le haut, page par page : de la ligne 74 à 14, puis au début.
    approcher("timeline-more-before");
    expect(screen.getByText("Salon 14")).toBeInTheDocument();
    expect(screen.queryByText("Salon 13")).toBeNull();
    approcher("timeline-more-before");
    expect(screen.getByText("Salon 0")).toBeInTheDocument();
    // Tout est là : plus de sentinelle en haut ; en bas, la dernière page.
    expect(screen.queryByTestId("timeline-more-before")).toBeNull();
    approcher("timeline-more-after");
    expect(rendus()).toBe(200);
    expect(screen.queryByTestId("timeline-more-after")).toBeNull();
  });

  it("les filtres et la recherche portent sur toute la frise, pas seulement sur ce qui est rendu", async () => {
    const user = userEvent.setup();
    await frise(beaucoup(200), { ...CONFIG, current_year: 1 });
    expect(screen.queryByText("Salon 190")).toBeNull();
    await user.type(screen.getByRole("searchbox"), "Salon 190");
    expect(await screen.findByText("Salon 190")).toBeInTheDocument();
  });

  it("une pastille de période hors de ce qui est rendu y mène", async () => {
    const user = userEvent.setup();
    // Neuf ans de dates : plusieurs tranches de cinq ans.
    await frise(beaucoup(84 * 9), { ...CONFIG, current_year: 1 });
    expect(document.querySelector("[data-year='7']")).toBeNull();
    await user.click(screen.getByRole("button", { name: "6 – 10" }));
    expect(document.querySelector("[data-year='6']")).not.toBeNull();
  });
});

describe("WorldTimeline — saisons", () => {
  it("les saisons remplacent les tranches de cinq ans et ouvrent leurs années d'un bandeau", async () => {
    await frise(
      [room("a", "Début", 1, 0, 1), room("b", "Milieu", 12, 0, 1), room("c", "Fin", 15, 0, 1)],
      { ...CONFIG, current_year: 12, ages: [{ name: "Âge des Cendres", from_year: 10, to_year: 19 }] },
    );
    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    // Nommées par leur période ; la courante porte en plus son nombre de salons.
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["1 – 5", "Âge des Cendres2"]);
    expect(within(nav).getByRole("button", { name: "Âge des Cendres" })).toHaveAttribute("aria-current", "true");
    // Un bandeau, une seule fois, avant la première année de la saison.
    const bandeaux = screen.getAllByTestId("timeline-age");
    expect(bandeaux).toHaveLength(1);
    expect(bandeaux[0]).toHaveTextContent("Âge des Cendres");
    expect(bandeaux[0]).toHaveTextContent("An 10 – 19");
    // Juste au-dessus du bandeau de sa première année.
    expect(bandeaux[0].nextElementSibling).toHaveAttribute("data-year", "12");
  });
});

describe("WorldTimeline — styles des suites", () => {
  const CHAINE = [suite("a", "b"), suite("b", "c")];
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

  it("la barre d'un événement qui dure se remesure quand la place des lignes de suite change", async () => {
    // Le décalage des titres (graphe, « au survol seulement ») fait partie de
    // la clé de mesure des barres : rien d'autre ne change alors dans la
    // frise. (Le calcul lui-même : EventSpans.test.tsx. Ici, le mock de
    // next-intl rend à chaque fois des fonctions neuves, ce qui remesure tout
    // de toute façon : seule la clé dit ce que ferait le vrai.)
    memoire.set("wvlds:timeline-suite-style", "graph");
    db.tables.chatroom_sequels = [suite("a", "c"), suite("b", "d")];
    db.tables.world_timeline_events = [{
      id: "e1", title: "Le siège", description: null, timeline_date: { year: 1, month: 0, day: 1 },
      end_date: { year: 1, month: 2, day: 5 }, wiki_page_id: null, wiki_page: null,
    }];
    await frise([room("a", "Prologue", 1, 0, 2), room("b", "Suite", 1, 1, 2), room("c", "Trois", 1, 1, 3), room("d", "Quatre", 1, 2, 2)]);
    const cle = () => document.querySelector("[data-suite-style]")?.getAttribute("data-layout") ?? "";
    // Graphe, deux couloirs (a → c et b → d se chevauchent) : 14 + 8 + 10 = 32px.
    await vi.waitFor(() => expect(cle()).toMatch(/:32:0$/));
    // Au survol seulement, un seul couloir réservé : 24px.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Au survol seulement" }));
    await vi.waitFor(() => expect(cle()).toMatch(/:24:0$/));
    // En rail, la marge droite réservée change aussi la clé.
    await user.selectOptions(screen.getByRole("combobox", { name: "Style des suites" }), "Rail continu");
    await vi.waitFor(() => expect(cle()).toMatch(/:0:\d+$/));
  });

  it("relit le style gardé à l'ouverture", async () => {
    memoire.set("wvlds:timeline-suite-style", "graph");
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
    await vi.waitFor(() => expect(screen.getByTestId("timeline-suite-links")).toHaveAttribute("data-style", "graph"));
  });

  it("par défaut, un rail par chaîne, une pastille par salon", async () => {
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
    const calque = await screen.findByTestId("timeline-suite-links");
    expect(calque).toHaveAttribute("data-style", "rail");
    // Une seule chaîne a → b → c, trois pastilles.
    expect(calque.querySelectorAll("[data-suite]")).toHaveLength(1);
    expect(calque.querySelector("[data-suite='a>b>c']")!.querySelectorAll("circle")).toHaveLength(3);
  });

  it("graphe : les titres se décalent pour laisser les couloirs entre le fil et eux", async () => {
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
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
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
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
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
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
    db.tables.chatroom_sequels = [...CHAINE, suite("z", "y")];
    const salons = [...SALONS(), room("y", "Suite hors chaîne", 3, 2, 1)];
    const { unmount } = await frise(salons);
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
    await frise(salons);
    const survol = await padDe();
    // Un seul couloir : la place d'origine, sans les couloirs suivants.
    expect(survol).toBeLessThan(toujours);
    expect(survol).toBe(14 + 10);
  });

  it("deux styles seulement : rail continu et graphe", async () => {
    db.tables.chatroom_sequels = CHAINE;
    await frise(SALONS());
    await screen.findByTestId("timeline-suite-links");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    const styles = await screen.findByRole("combobox", { name: "Style des suites" });
    expect([...(styles as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Rail continu", "Graphe à côté du fil"]);
    expect(screen.queryByRole("checkbox", { name: "Pointillés fléchés" })).toBeNull();
  });
});

describe("WorldTimeline — suites proposées par les joueurs", () => {
  const SALONS = () => [room("a", "Le départ", 1, 0, 6), room("b", "La frontière", 2, 0, 1), room("c", "L'exil", 3, 0, 1)];

  it("une suite proposée se trace en pointillés ; reliée à la chaîne d'un arc, elle en prend la couleur", async () => {
    db.tables.world_timeline_arcs = [{ id: "arc", name: "L'exil", color: "#22c55e", position: 0 }];
    db.tables.chatrooms = [
      { id: "a", arc_id: "arc", category_id: null },
      { id: "b", arc_id: "arc", category_id: null },
      { id: "c", arc_id: null, category_id: null },
    ];
    db.tables.chatroom_sequels = [suite("a", "b"), suite("b", "c", "pending", "Mojkkin")];
    await frise(SALONS());

    const calque = await vi.waitFor(() => {
      const c = screen.getByTestId("timeline-suite-links");
      expect(c.querySelector("[data-suite='b>c']")).not.toBeNull();
      return c;
    });
    // La chaîne acceptée a → b reste pleine.
    const chaine = calque.querySelector("[data-suite='a>b']")!;
    expect(chaine).not.toHaveAttribute("data-pending-link");
    expect(chaine.querySelector("[data-pending]")).toBeNull();
    // La suite proposée b → c se trace à part, en pointillés, à la couleur
    // de l'arc de la chaîne qu'elle rejoint.
    const proposee = calque.querySelector("[data-suite='b>c']")!;
    expect(proposee).toHaveAttribute("data-pending-link", "true");
    const traits = proposee.querySelectorAll("path");
    expect(traits.length).toBeGreaterThan(0);
    for (const trait of traits) {
      expect(trait.getAttribute("stroke-dasharray")).toBe("3 3");
      expect((trait as SVGElement).style.stroke).toBe("rgb(34, 197, 94)");
    }
  });

  it("une suite d'un arc à un autre : chaque arc garde sa chaîne et sa couleur, la passerelle passe de l'une à l'autre", async () => {
    db.tables.world_timeline_arcs = [
      { id: "comete", name: "La comète", color: "#22c55e", position: 0 },
      { id: "sang", name: "Le prix du sang", color: "#ef4444", position: 1 },
    ];
    db.tables.chatrooms = [
      { id: "a", arc_id: "comete", category_id: null },
      { id: "b", arc_id: "comete", category_id: null },
      { id: "c", arc_id: "sang", category_id: null },
      { id: "d", arc_id: "sang", category_id: null },
    ];
    db.tables.chatroom_sequels = [suite("a", "b"), suite("b", "c"), suite("c", "d")];
    await frise([...SALONS(), room("d", "Un nom oublié", 4, 0, 1)]);

    const calque = await vi.waitFor(() => {
      const c = screen.getByTestId("timeline-suite-links");
      expect(c.querySelector("[data-suite='b>c']")).not.toBeNull();
      return c;
    });
    // Deux chaînes, une par arc, chacune dans sa couleur.
    expect(calque.querySelector("[data-suite='a>b>c>d']")).toBeNull();
    expect((calque.querySelector("[data-suite='a>b'] path") as SVGElement).style.stroke).toBe("rgb(34, 197, 94)");
    expect((calque.querySelector("[data-suite='c>d'] path") as SVGElement).style.stroke).toBe("rgb(239, 68, 68)");
    // La passerelle : chaque bout dans la couleur de son arc, le tronc en fondu.
    const passerelle = calque.querySelector("[data-suite='b>c']")!;
    expect(passerelle).toHaveAttribute("data-bridge");
    const pastilles = passerelle.querySelectorAll("circle");
    expect([...pastilles].map((c) => (c as SVGElement).style.fill)).toEqual(["rgb(34, 197, 94)", "rgb(239, 68, 68)"]);
    const degrade = passerelle.querySelector("linearGradient")!;
    expect([...degrade.querySelectorAll("stop")].map((s) => s.getAttribute("stop-color"))).toEqual(["#22c55e", "#ef4444"]);
    expect((passerelle.querySelector("path") as SVGElement).style.stroke).toContain(`#${degrade.id}`);
  });

  it("une suite proposée entre deux salons déjà dans la même chaîne reste visible", async () => {
    // a → b → c accepté, et c proposé comme suite de a : sans tracé à part,
    // le pointillé se perdait sous le rail plein.
    db.tables.chatroom_sequels = [suite("a", "b"), suite("b", "c"), suite("a", "c", "pending")];
    await frise(SALONS());
    const calque = await vi.waitFor(() => {
      const c = screen.getByTestId("timeline-suite-links");
      expect(c.querySelector("[data-suite='a>c'][data-pending-link]")).not.toBeNull();
      return c;
    });
    expect(calque.querySelector("[data-suite='a>b>c']")).not.toHaveAttribute("data-pending-link");
  });

  it("qui joue dans le salon précédent voit la demande, et l'accepte", async () => {
    const user = userEvent.setup();
    db.tables.chatroom_sequels = [suite("a", "b", "pending", "Mojkkin")];
    db.rpcs.get_linkable_chatrooms = { data: [{ id: "a", mine: true }, { id: "b", mine: false }], error: null };
    await frise(SALONS());

    await user.click(await screen.findByRole("button", { name: /Suites proposées/ }));
    const liste = await screen.findByRole("list", { name: "Suites proposées" });
    expect(liste).toHaveTextContent("La frontière ferait suite à Le départ");
    expect(liste).toHaveTextContent("proposé par @Mojkkin");
    await user.click(within(liste).getByRole("button", { name: "Accepter la suite La frontière" }));
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "chatroom_sequels", op: "update", payload: { status: "accepted" } }));
  });

  it("refuser une suite proposée la supprime", async () => {
    const user = userEvent.setup();
    db.tables.chatroom_sequels = [suite("a", "b", "pending", "Mojkkin")];
    db.rpcs.get_linkable_chatrooms = { data: [{ id: "a", mine: true }], error: null };
    await frise(SALONS());
    await user.click(await screen.findByRole("button", { name: /Suites proposées/ }));
    await user.click(await screen.findByRole("button", { name: "Refuser la suite La frontière" }));
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "chatroom_sequels", op: "delete" }));
  });

  it("sans jouer dans le salon précédent, pas de demande à décider ; qui gère les salons les voit toutes", async () => {
    db.tables.chatroom_sequels = [suite("a", "b", "pending", "Mojkkin")];
    db.rpcs.get_linkable_chatrooms = { data: [{ id: "a", mine: false }], error: null };
    const { unmount } = await frise(SALONS());
    await screen.findByText("Le départ");
    expect(rpc).toHaveBeenCalledWith("get_world_timeline", { p_world_id: "w1", p_with_journals: false });
    expect(screen.queryByRole("button", { name: /Suites proposées/ })).toBeNull();
    unmount();

    await frise(SALONS(), CONFIG, { canManageLinks: true });
    expect(await screen.findByTestId("timeline-sequel-count")).toHaveTextContent("1");
  });
});

describe("WorldTimeline — fil de persona", () => {
  it("filtré par persona, le fil de la frise relie ses salons et son journal, dans la couleur de son groupe", async () => {
    const user = userEvent.setup();
    db.rpcs.get_chatroom_personas = {
      data: [
        { chat_id: "a", persona_id: "p-tess", persona_name: "Tess", group_color: "#a855f7" },
        { chat_id: "c", persona_id: "p-tess", persona_name: "Tess", group_color: "#a855f7" },
        { chat_id: "b", persona_id: "p-ivo", persona_name: "Ivo", group_color: null },
      ],
      error: null,
    };
    db.tables.persona_journal_entries = [{
      id: "j1", persona_id: "p-tess", body: "Une nuit sans lune.", timeline_date: { year: 2, month: 0, day: 3 }, persona: { name: "Tess" },
    }];
    await frise(
      [room("a", "Le départ", 1, 0, 6), room("b", "Chez Ivo", 1, 2, 1), room("c", "Le retour", 3, 0, 1)],
      { ...CONFIG, show_journals: true },
    );
    await screen.findByText("Journal de Tess");
    // Sans filtre, pas de fil.
    expect(screen.queryByTestId("timeline-persona-thread")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Persona présent" }), "Tess");

    const fil = await screen.findByTestId("timeline-persona-thread");
    // Ses deux salons et son entrée de journal, pas le salon d'Ivo.
    expect([...fil.querySelectorAll("[data-thread-point]")].map((c) => c.getAttribute("data-thread-point")).sort())
      .toEqual(["a", "c", "j1"]);
    expect((fil.querySelector("path") as SVGElement).style.stroke).toBe("rgb(168, 85, 247)");
    // Dans le style des suites (le rail par défaut), au premier couloir.
    expect(fil.closest("svg")).toHaveAttribute("data-style", "rail");
    expect(fil).toHaveAttribute("data-lane", "0");

    // Rappelé en tête ; la croix l'efface, et le filtre avec.
    const puce = screen.getByTestId("timeline-persona-thread-chip");
    expect(puce).toHaveTextContent("Fil de Tess");
    await user.click(within(puce).getByRole("button", { name: "Effacer le fil de Tess" }));
    expect(screen.queryByTestId("timeline-persona-thread")).toBeNull();
    expect(screen.getByText("Chez Ivo")).toBeInTheDocument();
  });

  it("le fil suit le style : en graphe, un couloir entre le fil et les titres, avant les suites", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => (k === "wvlds:timeline-suite-style" ? "graph" : null), setItem: () => {}, removeItem: () => {} },
    });
    db.rpcs.get_chatroom_personas = {
      data: [
        { chat_id: "a", persona_id: "p-tess", persona_name: "Tess", group_color: "#a855f7" },
        { chat_id: "b", persona_id: "p-tess", persona_name: "Tess", group_color: "#a855f7" },
      ],
      error: null,
    };
    db.tables.chatroom_sequels = [suite("a", "b")];
    await frise([room("a", "Le départ", 1, 0, 6), room("b", "La suite", 2, 0, 1)]);
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Persona présent" }), "Tess");

    const fil = await screen.findByTestId("timeline-persona-thread");
    expect(fil.closest("svg")).toHaveAttribute("data-style", "graph");
    expect(fil).toHaveAttribute("data-lane", "0");
    // La suite a → b passe au couloir suivant.
    expect(fil.closest("svg")!.querySelector("[data-suite='a>b']")).toHaveAttribute("data-lane", "1");
  });

  it("un persona sans groupe : un fil de la couleur du texte", async () => {
    const user = userEvent.setup();
    db.rpcs.get_chatroom_personas = {
      data: [{ chat_id: "a", persona_id: "p-ivo", persona_name: "Ivo", group_color: null }],
      error: null,
    };
    await frise([room("a", "Le départ", 1, 0, 6), room("b", "Ailleurs", 1, 2, 1)]);
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Persona présent" }), "Ivo");
    const fil = await screen.findByTestId("timeline-persona-thread");
    expect(fil.querySelector("circle")!.getAttribute("class")).toContain("fill-foreground");
  });
});
