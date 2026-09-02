import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { WikiLinkProvider } from "@/components/worlds/wiki/WikiLinkContext";
import { ChatroomMessageBubble } from "@/components/chatrooms/message/ChatroomMessageBubble";

// ──────────────────────────────────────────────────────────────────────────
// Dans un salon, « vous entrez dans [[Arkham]] » affichait un lien rouge
// barré, comme une erreur : le rendu sait résoudre ces liens, mais personne ne
// lui donnait les pages du monde ni où aller. Le fournisseur fait les deux.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ user: { id: "u1" }, profile: null }),
}));

const PAGES = [{ title: "Arkham", slug: "arkham", is_folder: false }];

/** Le strict nécessaire à une bulle : son texte, et à qui elle est. */
function message(content: string) {
  return { content, metadata: null };
}

beforeEach(() => {
  pushMock.mockReset();
  const mock = createSupabaseMock({ results: [{ data: PAGES, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

describe("WikiLinkProvider", () => {
  it("rend un [[lien]] de message cliquable, et l'ouvre dans le wiki du monde", async () => {
    render(
      <WikiLinkProvider worldId="w1">
        <ChatroomMessageBubble message={message("Vous entrez dans [[Arkham]].")} isMine={false} />
      </WikiLinkProvider>,
    );

    const lien = await screen.findByRole("button", { name: "Arkham" });
    await userEvent.click(lien);

    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("laisse un lien cassé quand la page n'existe pas dans ce monde", async () => {
    render(
      <WikiLinkProvider worldId="w1">
        <ChatroomMessageBubble message={message("Vers [[Innsmouth]].")} isMine={false} />
      </WikiLinkProvider>,
    );

    // La liste des pages arrive, et « Innsmouth » n'y est pas.
    await screen.findByText("Innsmouth");
    expect(screen.queryByRole("button", { name: "Innsmouth" })).toBeNull();
    expect(screen.getByText("Innsmouth").className).toContain("text-destructive");
  });

  it("sans fournisseur, un [[lien]] reste cassé plutôt que de mener nulle part", () => {
    render(<ChatroomMessageBubble message={message("Vers [[Arkham]].")} isMine={false} />);

    // Le markdown brut n'est pas résolu : les crochets restent tels quels.
    expect(screen.getByText(/\[\[Arkham\]\]/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arkham" })).toBeNull();
  });
});
