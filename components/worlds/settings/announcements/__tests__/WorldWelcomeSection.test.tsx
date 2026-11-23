import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => {
  const t = Object.assign(
    (k: string, v?: Record<string, unknown>) =>
      v && "count" in v ? `${k}:${v.count}` : v && "name" in v ? `${k}:${v.name}` : k,
    // La ligne de la cloche, dans l'aperçu : la clé, puis le titre.
    { rich: (k: string, v?: Record<string, unknown>) => `${k}:${String(v?.title ?? "")}` },
  );
  return { useTranslations: () => t, useLocale: () => "fr" };
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/MarkdownRenderer", async (orig) => ({
  ...(await orig<typeof import("@/components/MarkdownRenderer")>()),
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

const api = vi.hoisted(() => ({ welcome: vi.fn(), save: vi.fn(), test: vi.fn() }));
vi.mock("@/lib/worldAnnouncements", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/worldAnnouncements")>();
  return {
    ...real,
    fetchWorldWelcome: (...a: unknown[]) => api.welcome(...a),
    saveWorldWelcome: (...a: unknown[]) => api.save(...a),
    sendAnnouncementTest: (...a: unknown[]) => api.test(...a),
  };
});

import { WorldWelcomeSection } from "../WorldWelcomeSection";

const sample = { username: "mojkkin", world: "Ygg" };
const SAVED = {
  enabled: true, kind: "notification" as const, title: "Bienvenue {username}", body: "Ravi de vous voir dans {world}.",
  sent_count: 4, updated_at: "2026-11-22T10:00:00Z", author: { username: "Thaddeus" },
};

function renderSection(dmsEnabled = true) {
  return render(
    <div className="@container">
      <WorldWelcomeSection worldId="w1" worldName="Ygg" dmsEnabled={dmsEnabled} sample={sample} />
    </div>,
  );
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  api.welcome.mockReset().mockResolvedValue(null);
  api.save.mockReset().mockResolvedValue({ ok: true });
  api.test.mockReset().mockResolvedValue({ ok: true });
});

describe("WorldWelcomeSection", () => {
  it("sans modèle, activer ouvre l'éditeur ; enregistrer envoie le modèle et l'active", async () => {
    const user = userEvent.setup();
    renderSection();
    const toggle = await screen.findByRole("switch", { name: "enable" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);
    const editor = await screen.findByTestId("welcome-editor");
    expect(api.save).not.toHaveBeenCalled();
    const save = within(editor).getByTestId("welcome-save");
    expect(save).toBeDisabled();

    await user.type(within(editor).getByTestId("welcome-text"), "Salut {{username}");
    api.welcome.mockResolvedValue({ ...SAVED, kind: "message", title: null, body: "Salut {username}", sent_count: 0 });
    await user.click(save);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.anything(), {
      worldId: "w1", enabled: true, kind: "message", title: "", body: "Salut {username}", asWorld: false,
    }));
    expect(toast.success).toHaveBeenCalledWith("saved");
    await waitFor(() => expect(screen.queryByTestId("welcome-editor")).not.toBeInTheDocument());
    expect(await screen.findByTestId("welcome-summary")).toHaveTextContent("Salut {username}");
  });

  it("montre l'expéditeur et le nombre d'envois ; couper le modèle le désactive", async () => {
    api.welcome.mockResolvedValue(SAVED);
    const user = userEvent.setup();
    renderSection();
    const summary = await screen.findByTestId("welcome-summary");
    expect(summary).toHaveTextContent("Bienvenue {username}");
    expect(summary).toHaveTextContent("sender:Thaddeus");
    expect(summary).toHaveTextContent("sentCount:4");

    const toggle = screen.getByRole("switch", { name: "enable" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ worldId: "w1", enabled: false })));
    expect(toast.success).toHaveBeenCalledWith("disabledToast");
  });

  it("l'éditeur repart du modèle enregistré ; une notification demande un titre", async () => {
    api.welcome.mockResolvedValue(SAVED);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByTestId("welcome-edit"));
    const editor = await screen.findByTestId("welcome-editor");
    expect(within(editor).getByTestId("welcome-kind-notification")).toHaveAttribute("aria-checked", "true");
    const title = within(editor).getByTestId("welcome-title");
    expect(title).toHaveValue("Bienvenue {username}");
    expect(within(editor).getByTestId("welcome-text")).toHaveValue("Ravi de vous voir dans {world}.");

    await user.clear(title);
    expect(within(editor).getByTestId("welcome-save")).toBeDisabled();
    expect(within(editor).getByTestId("welcome-test")).toBeDisabled();

    await user.type(title, "Salut");
    await user.click(within(editor).getByTestId("welcome-test"));
    await waitFor(() => expect(api.test).toHaveBeenCalledWith(expect.anything(), {
      worldId: "w1", kind: "notification", title: "Salut", body: "Ravi de vous voir dans {world}.", asWorld: false,
    }));
    expect(toast.success).toHaveBeenCalledWith("testSent");
  });

  it("l'aperçu : en direct à côté de l'éditeur, et dans sa fenêtre, variables remplacées", async () => {
    api.welcome.mockResolvedValue(SAVED);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByTestId("welcome-edit"));
    const editor = await screen.findByTestId("welcome-editor");
    // Plus de bascule texte / aperçu : le champ reste là.
    expect(within(editor).getByTestId("welcome-text")).toBeInTheDocument();

    const direct = within(editor).getByTestId("welcome-live-preview");
    expect(direct).toHaveAttribute("data-kind", "notification");
    expect(within(direct).getByTestId("welcome-live-preview-opened")).toHaveTextContent("Ravi de vous voir dans Ygg.");
    // Pas d'accueil pour un message de bienvenue.
    expect(within(direct).queryByTestId("welcome-live-preview-home")).toBeNull();

    await user.click(within(editor).getByRole("button", { name: "previewOpen" }));
    const fenetre = await screen.findByTestId("announcement-preview-dialog");
    expect(within(fenetre).getByTestId("announcement-preview-opened")).toHaveTextContent("Ravi de vous voir dans Ygg.");
  });

  it("sans messages privés, un modèle en message privé se rouvre en notification", async () => {
    api.welcome.mockResolvedValue({ ...SAVED, kind: "message", title: null });
    const user = userEvent.setup();
    renderSection(false);
    await user.click(await screen.findByTestId("welcome-edit"));
    const editor = await screen.findByTestId("welcome-editor");
    expect(within(editor).queryByTestId("welcome-kind-message")).not.toBeInTheDocument();
    expect(within(editor).getByTestId("welcome-kind-notification")).toHaveAttribute("aria-checked", "true");
  });

  it("nomme le refus de la base", async () => {
    api.welcome.mockResolvedValue({ ...SAVED, enabled: false });
    api.save.mockResolvedValue({ ok: false, reason: "dms_disabled" });
    const user = userEvent.setup();
    renderSection();
    const toggle = await screen.findByRole("switch", { name: "enable" });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("errorDmsDisabled"));
  });

  it("pas de bandeau de bienvenue ; une notification peut être signée par le monde (migration 230)", async () => {
    api.welcome.mockResolvedValue({ ...SAVED, signed_as_world: true });
    const user = userEvent.setup();
    renderSection();
    // Le résumé nomme le monde comme expéditeur.
    expect(await screen.findByTestId("welcome-summary")).toHaveTextContent("sender:Ygg");

    await user.click(screen.getByTestId("welcome-edit"));
    const editor = await screen.findByTestId("welcome-editor");
    expect(within(editor).queryByTestId("welcome-kind-banner")).not.toBeInTheDocument();
    const sign = within(editor).getByRole("switch", { name: "asWorld" });
    expect(sign).toBeChecked();

    // Un message privé part toujours du compte : plus de signature à choisir.
    await user.click(within(editor).getByTestId("welcome-kind-message"));
    expect(within(editor).queryByRole("switch", { name: "asWorld" })).not.toBeInTheDocument();
    await user.click(within(editor).getByTestId("welcome-kind-notification"));

    await user.click(within(editor).getByTestId("welcome-save"));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kind: "notification", asWorld: true,
    })));
  });
});
