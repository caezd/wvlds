import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World, WorldTimelineConfig } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: true }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div data-testid="persona-template-stub" />,
}));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: () => <div data-testid="category-manager-stub" />,
}));
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({
  WorldHomeGridSettings: () => <div data-testid="home-grid-settings-stub" />,
}));
const setWorldTimelineMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAgeRestricted: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: (...args: unknown[]) => setWorldTimelineMock(...args),
  setWorldAvatarType: vi.fn().mockResolvedValue({ ok: true }),
  getWorldTags: vi.fn().mockResolvedValue({ ok: true, tags: [] }),
  addWorldTag: vi.fn().mockResolvedValue({ ok: true, tag: "" }),
  removeWorldTag: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const WITH_MONTHS: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février"],
  current_year: 1,
  current_month: null,
  days_per_month: [31, 28],
};

const NO_MONTHS: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: [],
  current_year: 1,
  current_month: null,
  days_per_month: [],
};

function baseWorld(config: WorldTimelineConfig): World {
  return {
    id: "w1",
    name: "Veldis",
    description: "",
    icon_url: null,
    banner_url: null,
    color: null,
    visibility: "private",
    enable_inventory: true,
    enable_skills: true,
    enable_faceclaims: true,
    restrict_inventory: false,
    restrict_skills: false,
    timeline_enabled: true,
    timeline_config: config,
    allows_real_avatars: false,
    allows_illustrated_avatars: false,
    is_age_restricted: false,
    wiki_label: null,
  };
}

function setup() {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

async function openTimelineSection(config: WorldTimelineConfig) {
  const user = userEvent.setup();
  render(<WorldSettingsView world={baseWorld(config)} />);
  await user.click(screen.getByRole("tab", { name: "Fonctions" }));
  return user;
}

describe("WorldSettingsView — Chronologie — jours par mois", () => {
  it("affiche un champ « jours » par mois, pré-rempli avec sa valeur enregistrée", async () => {
    setup();
    await openTimelineSection(WITH_MONTHS);
    expect((screen.getByLabelText("Jours en Janvier") as HTMLInputElement).value).toBe("31");
    expect((screen.getByLabelText("Jours en Février") as HTMLInputElement).value).toBe("28");
  });

  it("retombe sur la valeur par défaut (30) quand un mois n'a pas encore ce réglage", async () => {
    setup();
    const legacy: WorldTimelineConfig = { ...WITH_MONTHS, days_per_month: undefined };
    await openTimelineSection(legacy);
    expect((screen.getByLabelText("Jours en Janvier") as HTMLInputElement).value).toBe("30");
  });

  it("enregistre la nouvelle valeur d'un mois en quittant son champ, sans toucher les autres", async () => {
    setup();
    await openTimelineSection(WITH_MONTHS);
    const input = screen.getByLabelText("Jours en Février");

    // `userEvent.clear`/`.type` sur un `type="number"` ne remplace pas
    // fidèlement la valeur sous jsdom — on simule directement la saisie
    // finale et la perte de focus qui déclenche la persistance.
    fireEvent.change(input, { target: { value: "29" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(setWorldTimelineMock).toHaveBeenCalledWith(
        "w1",
        true,
        expect.objectContaining({ days_per_month: [31, 29] }),
      );
    });
  });

  it("« Utiliser les mois réels » règle aussi les longueurs de mois grégoriennes", async () => {
    setup();
    const user = await openTimelineSection(NO_MONTHS);
    await user.click(screen.getByRole("button", { name: "Utiliser les mois réels" }));

    await waitFor(() => {
      expect(setWorldTimelineMock).toHaveBeenCalledWith(
        "w1",
        true,
        expect.objectContaining({ days_per_month: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] }),
      );
    });
    expect((screen.getByLabelText("Jours en Janvier") as HTMLInputElement).value).toBe("31");
    expect((screen.getByLabelText("Jours en Février") as HTMLInputElement).value).toBe("28");
  });

  it("supprimer un mois retire aussi son réglage de jours, en gardant les tableaux alignés", async () => {
    setup();
    const user = await openTimelineSection(WITH_MONTHS);
    const janvierRow = screen.getByLabelText("Jours en Janvier").closest("div") as HTMLElement;
    const removeJanvier = within(janvierRow).getByRole("button");

    await user.click(removeJanvier);

    await waitFor(() => {
      expect(setWorldTimelineMock).toHaveBeenCalledWith(
        "w1",
        true,
        expect.objectContaining({ month_names: ["Février"], days_per_month: [28] }),
      );
    });
  });

  it("ajouter un mois lui donne la valeur par défaut (30 jours)", async () => {
    setup();
    const user = await openTimelineSection(WITH_MONTHS);

    await user.type(screen.getByPlaceholderText("Nom du mois…"), "Mars{Enter}");

    await waitFor(() => {
      expect(setWorldTimelineMock).toHaveBeenCalledWith(
        "w1",
        true,
        expect.objectContaining({ month_names: ["Janvier", "Février", "Mars"], days_per_month: [31, 28, 30] }),
      );
    });
  });
});
