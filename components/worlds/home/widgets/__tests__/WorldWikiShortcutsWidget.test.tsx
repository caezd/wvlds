import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Locale forcée à "en" pour prouver que le temps relatif suit la langue
// courante (Intl.RelativeTimeFormat) plutôt que d'être codé en dur en
// français — voir le commentaire Copilot corrigé sur ce fichier.
let mockLocale = "en";
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    if (key === "home.wikiShortcuts.updated") return `Updated ${opts?.time}`;
    if (key === "home.wikiShortcuts.justNow") return "just now";
    return key;
  },
  useLocale: () => mockLocale,
}));

import { WorldWikiShortcutsWidget } from "@/components/worlds/home/widgets/WorldWikiShortcutsWidget";

function setup(pages: unknown[]) {
  const mock = createSupabaseMock({ results: [{ data: pages }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLocale = "en";
});

describe("WorldWikiShortcutsWidget", () => {
  it("n'affiche rien quand le wiki est vide", async () => {
    setup([]);
    const { container } = render(<WorldWikiShortcutsWidget worldId="w1" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("liste les pages avec un lien direct vers ?view=wiki&page=<slug>", async () => {
    setup([
      { id: "p1", title: "Portail", slug: "portail", icon: null, updated_at: new Date().toISOString() },
    ]);
    render(<WorldWikiShortcutsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("Portail")).toBeInTheDocument();
    });
    expect(screen.getByText("Portail").closest("a")).toHaveAttribute(
      "href",
      "/w/w1?view=wiki&page=portail",
    );
  });

  it("encode le slug dans l'URL", async () => {
    setup([
      { id: "p1", title: "Été 1900", slug: "été 1900", icon: null, updated_at: new Date().toISOString() },
    ]);
    render(<WorldWikiShortcutsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("Été 1900").closest("a")).toHaveAttribute(
        "href",
        `/w/w1?view=wiki&page=${encodeURIComponent("été 1900")}`,
      );
    });
  });

  it("affiche le temps relatif dans la langue courante plutôt qu'en français codé en dur", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    setup([{ id: "p1", title: "Portail", slug: "portail", icon: null, updated_at: twoMinutesAgo }]);
    render(<WorldWikiShortcutsWidget worldId="w1" />);

    // Intl.RelativeTimeFormat("en", …) — pas "Il y a 2 min".
    await waitFor(() => {
      expect(screen.getByText("Updated 2 minutes ago")).toBeInTheDocument();
    });
  });

  it("affiche « just now » pour une modification de moins d'une minute", async () => {
    setup([{ id: "p1", title: "Portail", slug: "portail", icon: null, updated_at: new Date().toISOString() }]);
    render(<WorldWikiShortcutsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("Updated just now")).toBeInTheDocument();
    });
  });

  it("passe à la locale du formateur de date pour les modifications anciennes", async () => {
    mockLocale = "fr";
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    setup([{ id: "p1", title: "Portail", slug: "portail", icon: null, updated_at: twoMonthsAgo }]);
    render(<WorldWikiShortcutsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText(`Updated ${new Date(twoMonthsAgo).toLocaleDateString("fr")}`)).toBeInTheDocument();
    });
  });
});
