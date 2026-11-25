import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatroomCategory, World } from "@/types/worlds";

// Les pages des réglages ne chargent leurs données qu'à leur ouverture :
// ouvrir « Catégories » ne doit pas déclencher le modèle de fiche, les salles
// de la chatbox, etc. (mesuré le 2026-11-24 : une action serveur de 1,1 à 1,4 s
// et une dizaine de requêtes pour une page qui n'en demande qu'une).

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: [],
    membership: { userId: "owner", isOwner: true, roles: [], permissions: new Set(["administrator"]), rank: 2147483647 },
    can: () => true,
    refresh: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false, world_map: true, world_live_chat: true }),
}));
const mounts = vi.hoisted(() => ({ template: 0, channels: 0 }));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", async () => {
  const React = await import("react");
  return {
    WorldPersonaTemplateSection: () => {
      React.useEffect(() => { mounts.template += 1; }, []);
      return <div data-testid="persona-template" />;
    },
  };
});
vi.mock("@/components/worlds/settings/WorldLiveChannelsSettings", async () => {
  const React = await import("react");
  return {
    WorldLiveChannelsSettings: () => {
      React.useEffect(() => { mounts.channels += 1; }, []);
      return <div data-testid="live-channels" />;
    },
  };
});
const categoryManager = vi.hoisted(() => vi.fn());
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: (props: unknown) => { categoryManager(props); return <div data-testid="categories-tab" />; },
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRequireFaceclaim: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const MONDE = { id: "w1", name: "Ténèbres", visibility: "private", enable_live_chat: true } as unknown as World;
const CATEGORIES = [{ id: "c1", world_id: "w1", title: "Annonces", description: null, banner_url: null, icon_url: null, position: 0 }] as ChatroomCategory[];

function monter(props: { hasPersonaTemplate?: boolean } = {}) {
  vi.mocked(createClient).mockReturnValue(createSupabaseMock({ results: [{ data: null, error: null }] }).client as never);
  return render(<WorldSettingsView world={MONDE} initialCategories={CATEGORIES} hasPersonaTemplate={props.hasPersonaTemplate} />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections des paramètres" });

beforeEach(() => {
  vi.clearAllMocks();
  mounts.template = 0;
  mounts.channels = 0;
  params = new URLSearchParams("view=settings&section=categories");
  window.history.replaceState(null, "", "/w/w1?view=settings&section=categories");
});

describe("WorldSettingsView — chargement à la demande", () => {
  it("Catégories reçoit celles que le serveur a lues", () => {
    monter();
    expect(screen.getByTestId("categories-tab")).toBeInTheDocument();
    expect(categoryManager).toHaveBeenLastCalledWith(expect.objectContaining({ worldId: "w1", initialCategories: CATEGORIES }));
  });

  it("les pages « Fonctions » ne se montent qu'à leur ouverture, puis gardent leur état", async () => {
    const user = userEvent.setup();
    monter();
    expect(mounts.template).toBe(0);
    expect(mounts.channels).toBe(0);

    await user.click(within(nav()).getByRole("button", { name: "Fiche par défaut" }));
    expect(screen.getByTestId("persona-template")).toBeInTheDocument();
    expect(mounts.channels).toBe(0);

    await user.click(within(nav()).getByRole("button", { name: "Chatbox" }));
    expect(screen.getByTestId("live-channels")).toBeInTheDocument();
    await user.click(within(nav()).getByRole("button", { name: "Fiche par défaut" }));
    // Déjà ouverte : elle n'est pas remontée (son état et sa sauvegarde restent).
    expect(mounts.template).toBe(1);
  });

  it("l'état de la fiche par défaut vient du serveur, sans monter sa page", () => {
    monter({ hasPersonaTemplate: true });
    expect(within(nav()).getByRole("button", { name: "Fiche par défaut" })).toHaveAccessibleDescription("Actif");
    expect(mounts.template).toBe(0);
  });
});
