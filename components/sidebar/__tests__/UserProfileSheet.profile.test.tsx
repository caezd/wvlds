import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const updateProfileBioAndPronouns = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock("@/app/(protected)/settings/actions", () => ({ updateProfileBioAndPronouns }));
const route = vi.hoisted(() => ({ pathname: "/explore" }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => router,
}));

import { UserProfileSheet } from "@/components/sidebar/UserProfileSheet";

const W1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const CARD = {
  user_id: "me", status: "active", status_until: null, status_note: null, bio: "Rôliste du soir",
  availability: null, timezone: null, birthday_month: null, birthday_day: null, world: { name: "Cuntissimo" },
};
const PROFILE = { data: { bio: "Salut !", pronouns: ["he_him"] } };

function setup(results: { data: unknown; error?: unknown }[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function mount(onOpenChange = vi.fn()) {
  const sheet = (open: boolean) => (
    <UserProfileSheet open={open} onOpenChange={onOpenChange} userId="me" initialUsername="moi" initialAvatarUrl={null} email="moi@test.local" />
  );
  const view = render(sheet(true));
  return { onOpenChange, rerender: (open = true) => view.rerender(sheet(open)) };
}

/** L'état de la barre d'enregistrement. */
function saveState() {
  return screen.getByRole("status").getAttribute("data-state");
}

beforeEach(() => {
  vi.clearAllMocks();
  route.pathname = "/explore";
  updateProfileBioAndPronouns.mockResolvedValue({ success: true });
});

describe("Mon profil — une seule barre d'enregistrement", () => {
  it("ne modifier que la bio n'envoie que la bio et les pronoms", async () => {
    const mock = setup([PROFILE]);
    const user = userEvent.setup();
    mount();
    const bio = await screen.findByLabelText("Bio");
    expect(bio).toHaveValue("Salut !");
    expect(screen.getByRole("button", { name: "Il/Lui" })).toHaveAttribute("aria-pressed", "true");
    expect(saveState()).toBe("clean");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    await user.type(bio, " Ravi d'être là.");
    expect(saveState()).toBe("dirty");
    expect(screen.getByText("Modifications non enregistrées")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Salut ! Ravi d'être là.", ["he_him"]));
    expect(mock.buildersFor("profiles").some((b) => b.update.mock.calls.length > 0)).toBe(false);
    await waitFor(() => expect(saveState()).toBe("saved"));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("un pseudo déjà pris : toast précis, le pseudo reste à enregistrer, la bio ne l'est plus", async () => {
    setup([PROFILE, { data: null, error: { message: 'duplicate key value violates unique constraint "profiles_username_key"' } }]);
    const user = userEvent.setup();
    mount();
    const bio = await screen.findByLabelText("Bio");

    const pseudo = screen.getByLabelText("Pseudo");
    await user.clear(pseudo);
    await user.type(pseudo, "pris");
    await user.type(bio, "!");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ce pseudo est déjà pris."));
    expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Salut !!", ["he_him"]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(saveState()).toBe("dirty");

    // « Annuler » ne rend que le pseudo : la bio, elle, est enregistrée.
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByLabelText("Pseudo")).toHaveValue("moi");
    expect(screen.getByLabelText("Bio")).toHaveValue("Salut !!");
    expect(saveState()).toBe("clean");
  });

  it("un pseudo vide ne s'enregistre pas", async () => {
    setup([PROFILE]);
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Bio");
    await user.clear(screen.getByLabelText("Pseudo"));
    expect(saveState()).toBe("dirty");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("fermer avec des modifications en cours demande confirmation", async () => {
    setup([PROFILE]);
    const user = userEvent.setup();
    const { onOpenChange } = mount();
    await user.type(await screen.findByLabelText("Bio"), "!");
    await user.keyboard("{Escape}");

    expect(await screen.findByRole("alertdialog", { name: "Quitter sans enregistrer ?" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Quitter" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Ctrl + S enregistre", async () => {
    setup([PROFILE]);
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText("Bio"), "!");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Salut !!", ["he_him"]));
  });

  it("chaque ouverture relit la bio et les pronoms", async () => {
    setup([PROFILE, { data: { bio: "Écrite ailleurs", pronouns: [] } }]);
    const { rerender } = mount();
    expect(await screen.findByLabelText("Bio")).toHaveValue("Salut !");

    rerender(false);
    rerender(true);
    await waitFor(() => expect(screen.getByLabelText("Bio")).toHaveValue("Écrite ailleurs"));
    expect(screen.getByRole("button", { name: "Il/Lui" })).toHaveAttribute("aria-pressed", "false");
    expect(saveState()).toBe("clean");
  });
});

describe("Mon profil — pronoms", () => {
  it("trois pronoms choisis : les autres puces, « Autre » compris, sont désactivées", async () => {
    setup([{ data: { bio: "", pronouns: ["he_him", "she_her"] } }]);
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Bio");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Autre" }));
    await user.type(screen.getByRole("textbox", { name: "Autre" }), "xe/xem");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iel/Iel" })).toBeDisabled();
    // Les pronoms s'affichent sous le pseudo.
    expect(screen.getByText("Il/Lui · Elle/Elle · xe/xem")).toBeInTheDocument();

    // Décocher « Autre » vide son champ et libère une place.
    await user.click(screen.getByRole("button", { name: "Autre" }));
    expect(screen.queryByRole("textbox", { name: "Autre" })).toBeNull();
    expect(screen.getByRole("button", { name: "Iel/Iel" })).toBeEnabled();
  });
});

describe("Mon profil — onglet « Ma carte »", () => {
  it("hors d'un monde, pas d'onglet « Ma carte »", async () => {
    setup([PROFILE]);
    mount();
    await screen.findByLabelText("Bio");
    expect(screen.queryByRole("tab", { name: /Ma carte/ })).toBeNull();
    expect(screen.getByRole("tab", { name: "Compte" })).toBeInTheDocument();
  });

  it("dans un monde dont on est membre : la carte se règle, un point signale l'onglet modifié, la barre l'écrit", async () => {
    route.pathname = `/w/${W1}`;
    // world_members (ma carte), profiles (bio et pronoms), puis l'écriture de la carte
    const mock = setup([{ data: CARD }, PROFILE, { data: null, error: null }]);
    const user = userEvent.setup();
    mount();
    const tab = await screen.findByRole("tab", { name: /Ma carte/ });
    expect(tab).toHaveTextContent("Cuntissimo");
    await user.click(tab);

    const section = await screen.findByTestId("my-world-card");
    expect(section).toHaveTextContent("Ces informations ne concernent que Cuntissimo");
    const presentation = within(section).getByLabelText("Présentation");
    expect(presentation).toHaveValue("Rôliste du soir");
    // Pas de bouton propre au formulaire : la barre de la fiche enregistre.
    expect(within(section).queryByRole("button", { name: "Enregistrer" })).toBeNull();

    await user.clear(presentation);
    await user.type(presentation, "Rôliste du matin");
    expect(tab.querySelector("span.bg-warning")).not.toBeNull();
    expect(saveState()).toBe("dirty");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      const builder = mock.buildersFor("world_members").at(-1)!;
      expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ bio: "Rôliste du matin", status: "active" }));
      expect(builder.eq).toHaveBeenCalledWith("world_id", W1);
      expect(builder.eq).toHaveBeenCalledWith("user_id", "me");
    });
    expect(updateProfileBioAndPronouns).not.toHaveBeenCalled();
    await waitFor(() => expect(saveState()).toBe("saved"));
  });

  it("la carte échoue, la bio réussit : la carte reste à enregistrer, la bio ne l'est plus", async () => {
    route.pathname = `/w/${W1}`;
    // world_members (ma carte), profiles (bio et pronoms), puis l'écriture de la carte, refusée
    setup([{ data: CARD }, PROFILE, { data: null, error: { message: "refusé" } }]);
    const user = userEvent.setup();
    mount();
    const profileTab = screen.getByRole("tab", { name: /Profil/ });
    await user.type(await screen.findByLabelText("Bio"), "!");
    const cardTab = await screen.findByRole("tab", { name: /Ma carte/ });
    await user.click(cardTab);
    await user.type(within(await screen.findByTestId("my-world-card")).getByLabelText("Présentation"), " !");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Enregistrement de la carte impossible."));
    expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Salut !!", ["he_him"]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(saveState()).toBe("dirty");
    expect(cardTab.querySelector("span.bg-warning")).not.toBeNull();
    await waitFor(() => expect(profileTab.querySelector("span.bg-warning")).toBeNull());
  });

  it("changer de monde avec une carte modifiée : le brouillon reste celui du premier monde et s'y écrit", async () => {
    route.pathname = `/w/${W1}`;
    const W2 = "33333333-3333-4333-8333-333333333333";
    // ma carte (W1), profiles, ma carte (W2), puis l'écriture de la carte
    const mock = setup([
      { data: CARD },
      PROFILE,
      { data: { ...CARD, bio: "Ailleurs", world: { name: "Autre monde" } } },
      { data: null, error: null },
    ]);
    const user = userEvent.setup();
    const { rerender } = mount();
    await user.click(await screen.findByRole("tab", { name: /Ma carte/ }));
    const presentation = within(await screen.findByTestId("my-world-card")).getByLabelText("Présentation");
    await user.clear(presentation);
    await user.type(presentation, "Rôliste du matin");

    route.pathname = `/w/${W2}`;
    rerender();
    await waitFor(() => expect(mock.buildersFor("world_members")).toHaveLength(2));
    expect(screen.getByRole("tab", { name: /Ma carte/ })).toHaveTextContent("Cuntissimo");
    expect(within(screen.getByTestId("my-world-card")).getByLabelText("Présentation")).toHaveValue("Rôliste du matin");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      const builder = mock.buildersFor("world_members").at(-1)!;
      expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ bio: "Rôliste du matin" }));
      expect(builder.eq).toHaveBeenCalledWith("world_id", W1);
    });
    // Écrite, la carte laisse place à celle du monde courant.
    await waitFor(() => expect(screen.getByRole("tab", { name: /Ma carte/ })).toHaveTextContent("Autre monde"));
    expect(within(screen.getByTestId("my-world-card")).getByLabelText("Présentation")).toHaveValue("Ailleurs");
    expect(saveState()).toBe("saved");
  });

  it("le statut se choisit d'un sélecteur segmenté, avec l'aide de l'option choisie", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: CARD }, PROFILE]);
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("tab", { name: /Ma carte/ }));
    const section = await screen.findByTestId("my-world-card");
    expect(within(section).getByText("Vous jouez normalement.")).toBeInTheDocument();
    await user.click(within(section).getByRole("radio", { name: "En pause" }));
    expect(within(section).getByText("Vous ralentissez : réponses plus lentes.")).toBeInTheDocument();
    expect(within(section).getByLabelText("Retour prévu")).toBeInTheDocument();
  });

  it("dans un salon, le monde vient du salon", async () => {
    route.pathname = `/c/${C1}`;
    // chatrooms (le monde du salon), profiles (bio et pronoms), puis world_members (ma carte)
    const mock = setup([{ data: { world_id: W1 } }, PROFILE, { data: CARD }]);
    mount();
    await screen.findByRole("tab", { name: /Ma carte/ });
    expect(mock.client.from).toHaveBeenCalledWith("chatrooms");
  });

  it("dans un monde dont on n'est pas membre, pas d'onglet « Ma carte »", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: null }, PROFILE]);
    mount();
    await screen.findByLabelText("Bio");
    await waitFor(() => expect(screen.queryByRole("tab", { name: /Ma carte/ })).toBeNull());
  });
});

describe("Mon profil — onglet « Compte »", () => {
  it("l'adresse e-mail, et le changement de mot de passe", async () => {
    setup([PROFILE]);
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("tab", { name: "Compte" }));
    expect(screen.getByText("moi@test.local")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Changer le mot de passe/ }));
    expect(router.push).toHaveBeenCalledWith("/auth/update-password");
  });
});
