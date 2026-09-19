import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { WorldMemberCardFields } from "@/lib/worldMembers";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { WorldMemberCardDialog } from "@/components/worlds/members/WorldMemberCardDialog";

const INITIAL: WorldMemberCardFields = {
  status: "active",
  status_until: null,
  status_note: null,
  bio: "Ancienne bio",
  availability: null,
  timezone: "Europe/Paris",
  birthday_month: 10,
  birthday_day: 12,
};

beforeEach(() => vi.clearAllMocks());

function renderDialog(mode: "self" | "status", onSaved = vi.fn()) {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(
    <WorldMemberCardDialog
      worldId="w1"
      userId="u1"
      mode={mode}
      initial={INITIAL}
      onSaved={onSaved}
      open
      onOpenChange={() => {}}
    />,
  );
  return { mock, onSaved };
}

describe("WorldMemberCardDialog — ma carte", () => {
  it("enregistre la carte et le statut en une écriture sur world_members", async () => {
    const user = userEvent.setup();
    const { mock, onSaved } = renderDialog("self");

    const bio = screen.getByLabelText("Présentation");
    await user.clear(bio);
    await user.type(bio, "Rôliste du soir");
    await user.type(screen.getByLabelText("Disponibilités"), "Le soir en semaine");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const builder = mock.builders.find((b) => b.table === "world_members")!.builder;
    expect(builder.update).toHaveBeenCalledWith({
      status: "active",
      status_until: null,
      status_note: null,
      bio: "Rôliste du soir",
      availability: "Le soir en semaine",
      timezone: "Europe/Paris",
      birthday_month: 10,
      birthday_day: 12,
    });
    expect(builder.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ bio: "Rôliste du soir" }));
  });

  it("passer en pause ouvre la date de retour et le mot, enregistrés avec le statut", async () => {
    const user = userEvent.setup();
    const { mock } = renderDialog("self");

    await user.click(screen.getByRole("radio", { name: /En pause/ }));
    await user.type(screen.getByLabelText("Retour prévu"), "2026-10-15");
    await user.type(screen.getByLabelText("Un mot"), "examens");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const builder = mock.builders.find((b) => b.table === "world_members")!.builder;
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused", status_until: "2026-10-15", status_note: "examens" }),
      );
    });
  });

  it("un anniversaire à moitié renseigné bloque l'enregistrement", async () => {
    const user = userEvent.setup();
    renderDialog("self");

    await user.click(screen.getByRole("combobox", { name: "Jour" }));
    await user.click(await screen.findByRole("option", { name: "—" }));

    expect(screen.getByText("Indiquez le jour et le mois, ou ni l'un ni l'autre.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("signale l'échec et garde le dialogue ouvert", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: { message: "RLS" } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldMemberCardDialog worldId="w1" userId="u1" mode="self" initial={INITIAL} onSaved={onSaved} open onOpenChange={onOpenChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mock.builders.length).toBeGreaterThan(0));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("WorldMemberCardDialog — statut d'un autre membre", () => {
  it("ne montre que le statut, et n'écrit que lui", async () => {
    const user = userEvent.setup();
    const { mock } = renderDialog("status");

    expect(screen.queryByLabelText("Présentation")).toBeNull();
    expect(screen.queryByLabelText("Disponibilités")).toBeNull();

    await user.click(screen.getByRole("radio", { name: /Absent/ }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const builder = mock.builders.find((b) => b.table === "world_members")!.builder;
      expect(builder.update).toHaveBeenCalledWith({ status: "away", status_until: null, status_note: null });
    });
  });
});
