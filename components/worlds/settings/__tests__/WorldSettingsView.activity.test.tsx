import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const acces = { perms: new Set<string>(["administrator"]), economy: true };
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: [],
    membership: { userId: "me", isOwner: false, roles: [], permissions: acces.perms, rank: 1 },
    can: (p: string) => acces.perms.has("administrator") || acces.perms.has(p),
    refresh: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false, world_map: true, world_economy: acces.economy }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/worlds/settings/WorldRolesTab", () => ({ WorldRolesTab: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldReportsTab", () => ({ WorldReportsTab: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldAnnouncementsTab", () => ({ WorldAnnouncementsTab: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({ WorldPersonaTemplateSection: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({ WorldCategoryManager: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({ WorldHomeGridSettings: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldRelationsSettings", () => ({ WorldRelationsSettings: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldGroupsSettings", () => ({ WorldGroupsSettings: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldActivityTab", () => ({
  WorldActivityTab: ({ worldId, units }: { worldId: string; units: { short: string }[] }) => (
    <p>journal de {worldId} en {units.map((u) => u.short).join("/")}</p>
  ),
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const MONDE = {
  id: "w1",
  name: "Veldis",
  visibility: "private",
  currency_units: [
    { name: "Or", short: "po", value: 100 },
    { name: "Cuivre", short: "pc", value: 1 },
  ],
} as unknown as World;

function monter() {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return render(<WorldSettingsView world={MONDE} />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections des paramètres" });
const entrees = (groupe: string) =>
  within(within(nav()).getByRole("group", { name: groupe })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

beforeEach(() => {
  acces.perms = new Set(["administrator"]);
  acces.economy = true;
  window.history.replaceState(null, "", "/w/w1?view=settings");
});

describe("WorldSettingsView — Journal", () => {
  it("rangé sous Membres, après les rôles ; la page reçoit la monnaie du monde", async () => {
    monter();
    expect(entrees("Membres")).toEqual(["Rôles", "Journal"]);
    await userEvent.click(within(nav()).getByRole("button", { name: "Journal" }));
    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
    expect(screen.getByText("journal de w1 en po/pc")).toBeInTheDocument();
  });

  it("ouvert à qui gère l'économie, sans autre droit", () => {
    acces.perms = new Set(["economy.manage"]);
    monter();
    expect(entrees("Membres")).toEqual(["Journal"]);
  });

  it("derrière le drapeau de l'économie", () => {
    acces.economy = false;
    monter();
    expect(entrees("Membres")).toEqual(["Rôles"]);
  });
});
