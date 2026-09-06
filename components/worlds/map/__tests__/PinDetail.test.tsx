import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PinDetail } from "@/components/worlds/map/PinDetail";
import type { MapPin, MapPinLink } from "@/app/actions/worldMap";
import type { PinRoom } from "@/components/worlds/map/types";
import { makeMap, makePin, makePinLink, makePlacedPersona, makeRegion, WIKI_PAGES } from "./fixtures";

/** Deux cartes : celle du lieu, et celle qu'il peut ouvrir. */
const CARTES = [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })];

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

// Qui regarde : hors provider le hook rend des valeurs neutres, et aucun
// persona ne serait alors reconnu comme sien.
const moi = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: moi.userId }),
}));

// Le sélecteur de personas lit la session et la liste des personas du monde :
// ce qui se vérifie ici est que la fiche l'ouvre et pose ce qu'il en rend.
vi.mock("@/components/personas/PersonaPickerDialog", () => ({
  PersonaPickerDialog: ({ trigger, onSelect }: {
    trigger?: React.ReactElement;
    onSelect: (p: { id: string } | null) => void;
  }) => (
    <>
      {trigger}
      <button type="button" onClick={() => onSelect({ id: "per9" })}>Choisir Nyx</button>
    </>
  ),
}));

// L'éditeur de paragraphe charge tout le composeur : un champ suffit ici.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

function monter(
  p: MapPin,
  isEditMode = false,
  rooms: PinRoom[] = [],
  canPost = false,
) {
  const mock = createSupabaseMock();
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const onUpdated = vi.fn();
  const onOpenMap = vi.fn();
  const onPlacePersona = vi.fn();
  render(
    <PinDetail
      pin={p}
      wikiPages={WIKI_PAGES}
      rooms={rooms}
      maps={CARTES}
      isEditMode={isEditMode}
      canPost={canPost}
      worldId="w1"
      onUpdated={onUpdated}
      onDelete={vi.fn()}
      onOpenMap={onOpenMap}
    />,
  );
  return { onUpdated, onOpenMap, onPlacePersona };
}

beforeEach(() => {
  pushMock.mockReset();
  updateMapPin.mockClear();
});

describe("PinDetail — page du wiki", () => {
  it("ouvre la page liée depuis l'épingle", async () => {
    monter(makePin({ wiki_page_id: "p1" }));

    const lien = await screen.findByRole("button", { name: /Ouvrir la page du wiki : Arkham/ });
    await userEvent.click(lien);

    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("ne montre que le titre de la page — le livre dit le reste", () => {
    // La phrase reste en nom accessible : « Arkham » seul ne dirait rien à
    // qui écoute la page.
    monter(makePin({ wiki_page_id: "p1" }));

    expect(screen.getByRole("button", { name: /Ouvrir la page du wiki : Arkham/ }))
      .toHaveTextContent(/^Arkham$/);
  });

  it("associe une page en modifiant l'épingle", async () => {
    const { onUpdated } = monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Page du wiki" }), "p2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({ wiki_page_id: "p2" }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ wiki_page_id: "p2" }));
  });

  it("ne montre aucun lien quand l'épingle n'a pas de page", async () => {
    monter(makePin());

    // Les pages arrivent ; rien n'est lié.
    await screen.findByText("Le port");
    expect(screen.queryByRole("button", { name: /Ouvrir la page du wiki/ })).toBeNull();
  });
});

describe("PinDetail — carte liée", () => {
  it("ouvre la carte que le lieu désigne", async () => {
    const { onOpenMap } = monter(makePin({ target_map_id: "map2" }));

    const versLaCarte = screen.getByRole("button", { name: /Ouvrir la carte : Le donjon/ });
    expect(versLaCarte).toHaveTextContent(/^Le donjon$/);
    await userEvent.click(versLaCarte);

    expect(onOpenMap).toHaveBeenCalledWith("map2");
  });

  it("associe une carte en modifiant le lieu", async () => {
    const { onUpdated } = monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Carte liée" }), "map2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({ target_map_id: "map2" }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ target_map_id: "map2" }));
  });

  it("ne propose pas au lieu d'ouvrir sa propre carte", async () => {
    // Le lien y serait un bouton qui ne va nulle part — et la base l'interdit.
    monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    const choix = screen.getByRole("combobox", { name: "Carte liée" });

    expect([...choix.querySelectorAll("option")].map(o => o.textContent)).toEqual([
      "Aucune carte",
      "Le donjon",
    ]);
  });

  it("ne montre aucun lien quand le lieu ne mène nulle part", () => {
    monter(makePin());
    expect(screen.queryByRole("button", { name: /Ouvrir la carte/ })).toBeNull();
  });
});

describe("PinDetail — ce qui se joue ici", () => {
  const SALONS: PinRoom[] = [
    { id: "c1", title: "La taverne du port", name: null, map_pin_id: "pin1" },
    { id: "c2", title: null, name: "Les quais", map_pin_id: "pin1" },
  ];

  it("liste les salons rattachés au lieu", () => {
    // Le lien existait en base depuis qu'un salon peut se situer sur la carte ;
    // seul le sens carte → salons manquait.
    monter(makePin(), false, SALONS);

    expect(screen.getByRole("button", { name: /La taverne du port/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Les quais/ })).toBeInTheDocument();
  });

  it("ouvre le salon choisi", async () => {
    monter(makePin(), false, SALONS);

    await userEvent.click(screen.getByRole("button", { name: /La taverne du port/ }));

    expect(pushMock).toHaveBeenCalledWith("/c/c1");
  });

  it("ne montre rien quand aucun salon ne s'y joue", () => {
    monter(makePin());
    expect(screen.queryByText("Ce qui s’y joue")).toBeNull();
  });
});

describe("PinDetail — jouer ici", () => {
  it("ouvre le composeur d'accueil sur ce lieu", async () => {
    // Le composeur sait situer un salon depuis longtemps ; il ne manquait que
    // le chemin depuis le lieu lui-même.
    monter(makePin(), false, [], true);

    await userEvent.click(screen.getByRole("button", { name: "Jouer ici" }));

    expect(pushMock).toHaveBeenCalledWith("/w/w1?play=pin1");
  });

  it("ne le propose pas à qui ne peut pas ouvrir de salon", () => {
    monter(makePin());
    expect(screen.queryByRole("button", { name: "Jouer ici" })).toBeNull();
  });
});



describe("PinDetail — dans le temps", () => {
  const CHRONO = {
    year_label: "An",
    era_name: null,
    month_names: ["Janvier", "Février", "Mars"],
    current_year: 1327,
    current_month: null,
  };

  function monterDate(p: MapPin, isEditMode = false) {
    const onUpdated = vi.fn();
    render(
      <PinDetail
        pin={p}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        timelineConfig={CHRONO}
        isEditMode={isEditMode}
        worldId="w1"
        onUpdated={onUpdated}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );
    return onUpdated;
  }

  it("dit depuis quand et jusqu'à quand", () => {
    monterDate(makePin({
      exists_from: { year: 1200, month: null, day: null },
      exists_until: { year: 1300, month: 2, day: 3 },
    }));
    expect(screen.getByText("De An 1200 à 3 Mars, An 1300")).toBeInTheDocument();
  });

  it("se tait pour un lieu de toujours", () => {
    monterDate(makePin());
    expect(screen.queryByText(/^De |^Depuis |^Jusqu/)).toBeNull();
  });

  it("prend une date de fondation en modifiant l'épingle", async () => {
    const onUpdated = monterDate(makePin(), true);
    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "Existe depuis" }), "1200");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({
      exists_from: { year: 1200, month: null, day: null },
      exists_until: null,
    }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ exists_from: { year: 1200, month: null, day: null } }));
  });
});

describe("PinDetail — la carte du lieu", () => {
  it("pose « Jouer ici » à côté du nom, sur la bannière", () => {
    // C'est l'action qu'on vient chercher : elle n'a pas à se trouver plus bas
    // que ce qui la nomme.
    monter(makePin(), false, [], true);

    const titre = screen.getByRole("heading", { name: "Le port" });
    const jouer = screen.getByRole("button", { name: "Jouer ici" });
    expect(jouer.parentElement).toBe(titre.parentElement);
  });

  it("porte son titre sur la bannière, sans croix pour le refermer", () => {
    // La croix mangeait un coin de l'image pour ce qu'Échap et un clic sur la
    // carte font déjà.
    monter(makePin());

    expect(screen.getByRole("heading", { name: "Le port" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  });

  it("dit ce que le lieu est avant ce vers quoi il mène", () => {
    monter(makePin({ description: "Des quais brumeux.", wiki_page_id: "p1" }));

    const description = screen.getByText("Des quais brumeux.");
    const lien = screen.getByRole("button", { name: /Ouvrir la page du wiki/ });
    expect(description.compareDocumentPosition(lien) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("écrit la description en petit, sans la couche prose de trop", () => {
    // `MarkdownRenderer` posait son propre `sm:prose-base` : le texte d'un lieu
    // passait à 16 px sur écran large, dans une carte de 340 px.
    monter(makePin({ description: "Des quais brumeux." }));

    const prose = screen.getByText("Des quais brumeux.").closest(".prose")!;
    expect(prose.className).toContain("prose-p:text-xs");
    expect(prose.querySelectorAll(".prose")).toHaveLength(0);
  });

  it("ouvre l'apparence de l'épingle depuis la barre d'actions", async () => {
    // La pastille a quitté la bannière, où le titre a pris sa place.
    monter(makePin(), true);

    await userEvent.click(screen.getByRole("button", { name: "Modifier le visuel du pin" }));

    expect(await screen.findByText("Visuel du pin")).toBeInTheDocument();
  });

  it("ne propose l'apparence qu'à ceux qui peuvent modifier la carte", () => {
    monter(makePin());
    expect(screen.queryByRole("button", { name: "Modifier le visuel du pin" })).toBeNull();
  });

  it("rend le titre au formulaire pendant qu'on le corrige", async () => {
    // Un champ de saisie par-dessus une photo se lirait mal.
    monter(makePin(), true);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    expect(screen.queryByRole("heading", { name: "Le port" })).toBeNull();
    expect(screen.getByPlaceholderText("Nom du lieu")).toHaveValue("Le port");
  });
});

describe("PinDetail — où se trouve ce lieu", () => {
  function monterSitue(props: Partial<React.ComponentProps<typeof PinDetail>> = {}) {
    render(
      <PinDetail
        pin={makePin()}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        isEditMode={false}
        worldId="w1"
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
        {...props}
      />,
    );
  }

  it("nomme la carte et la région qui l'entoure", () => {
    // La carte le savait — un polygone se referme autour de l'épingle — mais
    // ne le disait nulle part.
    monterSitue({ ownMap: makeMap({ label: "Le continent" }), region: makeRegion({ label: "Le royaume" }) });

    expect(screen.getByText("Le continent")).toBeInTheDocument();
    expect(screen.getByText("Le royaume")).toBeInTheDocument();
  });

  it("ne montre rien quand le lieu n'est dans aucune région", () => {
    monterSitue({ ownMap: makeMap({ label: "Le continent" }) });

    expect(screen.getByText("Le continent")).toBeInTheDocument();
    expect(screen.queryByText("Le royaume")).toBeNull();
  });
});

describe("PinDetail — ce que le lieu rejoint", () => {
  const PORT = makePin({ id: "pin1", title: "Le port", x: 20, y: 50 });
  const DONJON = makePin({ id: "pin2", title: "Le donjon", x: 60, y: 50 });
  const RUINE = makePin({ id: "pin3", title: "La ruine", x: 20, y: 80 });

  function monterRelie(links: MapPinLink[], scale: { widthUnits: number; unit: string } | null = null) {
    const onOpenPin = vi.fn();
    render(
      <PinDetail
        pin={PORT}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        links={links}
        pinsById={new Map([PORT, DONJON, RUINE].map((p) => [p.id, p]))}
        aspect={0.5}
        scale={scale}
        onOpenPin={onOpenPin}
        isEditMode={false}
        worldId="w1"
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );
    return { onOpenPin };
  }

  it("nomme les lieux voisins autour de celui-ci", () => {
    monterRelie([
      makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin2" }),
      // L'ordre des deux bouts ne veut rien dire : le voisin est l'autre.
      makePinLink({ id: "l2", from_pin_id: "pin3", to_pin_id: "pin1" }),
    ]);

    expect(screen.getByText("Ce qu'il rejoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Le donjon/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /La ruine/ })).toBeInTheDocument();
    expect(document.querySelector("[data-link-graph-center]")).toHaveTextContent("Le port");
  });

  it("ouvre le voisin qu'on clique", async () => {
    const { onOpenPin } = monterRelie([makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin2" })]);

    await userEvent.click(screen.getByRole("button", { name: /Le donjon/ }));

    expect(onOpenPin).toHaveBeenCalledWith(DONJON);
  });

  it("dit la distance quand la carte est à l'échelle", () => {
    // 40 % de la largeur d'une carte de 1 000 km : 400 km.
    monterRelie(
      [makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin2" })],
      { widthUnits: 1000, unit: "km" },
    );

    expect(screen.getByRole("button", { name: /Le donjon/ })).toHaveTextContent("400 km");
  });

  it("se tait pour un lieu que rien ne rejoint", () => {
    monterRelie([]);
    expect(screen.queryByText("Ce qu'il rejoint")).toBeNull();
  });

  it("montre à gauche le voisin qui est à l'ouest", () => {
    // Les voisins alternaient droite puis gauche, dans l'ordre des liens : un
    // lieu à l'ouest se retrouvait à droite une fois sur deux.
    // `LE PORT` est à 20 %, `DONJON` à 60 % : le donjon est à l'est, la
    // ruine — à 20 %, comme le port — juste au sud.
    monterRelie([
      makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin2" }),
      makePinLink({ id: "l2", from_pin_id: "pin1", to_pin_id: "pin3" }),
    ]);

    const donjon = screen.getByRole("button", { name: "Le donjon" });
    expect(Number.parseFloat(donjon.style.left)).toBeGreaterThan(50);
  });

  it("place l'ouest à gauche du centre", () => {
    const OUEST = makePin({ id: "pin4", title: "Le cap", x: 5, y: 50 });
    render(
      <PinDetail
        pin={makePin({ id: "pin1", title: "Le port", x: 60, y: 50 })}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        links={[makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin4" })]}
        pinsById={new Map([[ "pin1", makePin({ id: "pin1", title: "Le port", x: 60, y: 50 }) ], ["pin4", OUEST]])}
        aspect={1}
        scale={null}
        onOpenPin={vi.fn()}
        isEditMode={false}
        worldId="w1"
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );

    const cap = screen.getByRole("button", { name: "Le cap" });
    expect(Number.parseFloat(cap.style.left)).toBeLessThan(50);
    // Le point d'accroche reste du côté du centre : la boîte pousse vers le
    // bord. Poussée vers l'intérieur, elle mettait son repère sur le bord
    // opposé au trait et mordait le couloir du centre.
    expect(cap.style.transform).toContain("translate(-100%");
  });

  it("pousse chaque étiquette vers son bord, jamais vers le centre", () => {
    monterRelie([
      makePinLink({ id: "l1", from_pin_id: "pin1", to_pin_id: "pin2" }),
      makePinLink({ id: "l2", from_pin_id: "pin1", to_pin_id: "pin3" }),
    ]);

    // `DONJON` est à l'est du port : sa boîte s'étend vers la droite.
    expect(screen.getByRole("button", { name: "Le donjon" }).style.transform)
      .toContain("translate(0");
  });
});

describe("PinDetail — les commandes d'auteur", () => {
  function monterEnEdition() {
    const mock = createSupabaseMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(
      <PinDetail
        pin={makePin()}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        isEditMode
        worldId="w1"
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );
  }

  it("les tient au pied de la fiche, hors de ce qui défile", () => {
    // Au fil du contenu, elles s'éloignaient à mesure qu'un lieu se
    // remplissait : il fallait dérouler toute une fiche pour corriger un
    // titre. Enfant direct de la fiche, le pied ne défile pas avec elle.
    monterEnEdition();

    const pied = document.querySelector("[data-pin-detail] > [data-pin-actions]");
    expect(pied).not.toBeNull();
    expect(pied).toContainElement(screen.getByRole("button", { name: "Modifier" }));
    expect(pied).toContainElement(screen.getByRole("button", { name: "Supprimer" }));
  });
});

describe("PinDetail — qui se trouve ici", () => {
  function monterAvecDuMonde(
    personasHere = [makePlacedPersona()],
    onPlacePersona?: (personaId: string) => void,
    onRemovePersona?: (personaId: string) => void,
  ) {
    render(
      <PinDetail
        pin={makePin()}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        personasHere={personasHere}
        onPlacePersona={onPlacePersona}
        onRemovePersona={onRemovePersona}
        isEditMode={false}
        worldId="w1"
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );
  }

  it("nomme ceux qui sont là — la carte n'en donne que le nombre", () => {
    monterAvecDuMonde([
      makePlacedPersona({ id: "a", name: "Kael" }),
      makePlacedPersona({ id: "b", name: "Ifyr" }),
    ]);

    expect(screen.getByText("Qui est ici")).toBeInTheDocument();
    expect(screen.getByText("Kael")).toBeInTheDocument();
    expect(screen.getByText("Ifyr")).toBeInTheDocument();
  });

  it("se tait pour un lieu désert", () => {
    monterAvecDuMonde([]);
    expect(screen.queryByText("Qui est ici")).toBeNull();
  });

  it("ancre chaque avatar chez lui", () => {
    // `StoredImage` se pose en `absolute inset-0` : sans ancêtre positionné,
    // elle va chercher le cadre de la carte, et les avatars s'étalent en
    // plein écran, l'un sur l'autre.
    monterAvecDuMonde([makePlacedPersona({ avatar_url: "https://x/a.webp" })]);

    expect(document.querySelector("[data-persona-avatar]")).toHaveClass("relative");
  });

  it("offre de s'installer là où il n'y a personne", () => {
    // Le bloc se taisait pour un lieu désert : le geste n'aurait alors existé
    // qu'aux endroits déjà occupés, et un lieu vide le serait resté.
    monterAvecDuMonde([], vi.fn());

    expect(screen.getByText("Qui est ici")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "M'installer ici" })).toBeInTheDocument();
  });

  it("pose le persona choisi sur ce lieu", async () => {
    const onPlacePersona = vi.fn();
    monterAvecDuMonde([], onPlacePersona);

    await userEvent.click(screen.getByRole("button", { name: "Choisir Nyx" }));

    expect(onPlacePersona).toHaveBeenCalledWith("per9");
  });

  it("ne propose rien à qui ne joue pas dans ce monde", () => {
    monterAvecDuMonde([makePlacedPersona()]);

    expect(screen.queryByRole("button", { name: "M'installer ici" })).toBeNull();
  });

  it("fait partir le persona qu'on lui désigne", async () => {
    const onRemovePersona = vi.fn();
    monterAvecDuMonde([makePlacedPersona({ id: "per1", name: "Kael" })], undefined, onRemovePersona);

    await userEvent.click(screen.getByRole("button", { name: "Retirer Kael de ce lieu" }));

    expect(onRemovePersona).toHaveBeenCalledWith("per1");
  });

  it("ne fait partir que les siens", () => {
    // La RLS refuserait de toute façon, mais après coup : un bouton qui ne
    // peut pas aboutir n'a rien à faire là.
    monterAvecDuMonde(
      [
        makePlacedPersona({ id: "a", name: "Kael" }),
        makePlacedPersona({ id: "b", name: "Ifyr", user_id: "u2" }),
      ],
      undefined,
      vi.fn(),
    );

    expect(screen.getByRole("button", { name: "Retirer Kael de ce lieu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer Ifyr de ce lieu" })).toBeNull();
  });
});
