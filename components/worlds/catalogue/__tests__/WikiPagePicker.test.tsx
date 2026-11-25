import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: vi.fn() }) }));

import { WikiPagePicker } from "../WikiPagePicker";

const pages = [
  { id: "p1", title: "Guide", slug: "guide", icon: null },
  { id: "p2", title: "Règles", slug: "regles", icon: null },
];

describe("WikiPagePicker", () => {
  it("se sert des pages fournies, sans les relire", () => {
    render(<WikiPagePicker worldId="w1" value={["p1"]} onChange={() => {}} pages={pages} />);
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lier une page/i })).toBeEnabled();
  });

  it("une seule page au plus avec max=1", () => {
    render(<WikiPagePicker worldId="w1" value={["p1"]} onChange={() => {}} pages={pages} max={1} />);
    expect(screen.getByRole("button", { name: /Lier une page/i })).toBeDisabled();
  });
});
