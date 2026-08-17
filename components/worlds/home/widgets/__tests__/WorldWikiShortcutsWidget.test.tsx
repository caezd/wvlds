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

import { WorldWikiShortcutsWidget } from "@/components/worlds/home/widgets/WorldWikiShortcutsWidget";

function setup(pages: unknown[]) {
  const mock = createSupabaseMock({ results: [{ data: pages }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
