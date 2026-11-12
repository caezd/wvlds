import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// On capture la prop `prefetch` reçue par `next/link`.
const recu = vi.hoisted(() => ({ prefetch: [] as unknown[] }));
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...props }: { prefetch?: unknown; children: React.ReactNode } & Record<string, unknown>) => {
    recu.prefetch.push(prefetch);
    return <a {...props}>{children}</a>;
  },
}));

import { ChatroomLink } from "../ChatroomLink";

describe("ChatroomLink", () => {
  it("ne précharge pas à l'affichage, puis rend le préchargement par défaut à l'intention", () => {
    recu.prefetch.length = 0;
    const onPointerEnter = vi.fn();
    render(<ChatroomLink href="/c/1" onPointerEnter={onPointerEnter}>Taverne</ChatroomLink>);
    expect(recu.prefetch.at(-1)).toBe(false);

    fireEvent.pointerEnter(screen.getByRole("link", { name: "Taverne" }));
    expect(recu.prefetch.at(-1)).toBeNull();
    // Le gestionnaire de l'appelant est toujours appelé.
    expect(onPointerEnter).toHaveBeenCalled();
  });

  it("précharge aussi au focus clavier et au toucher", () => {
    recu.prefetch.length = 0;
    const { unmount } = render(<ChatroomLink href="/c/2">A</ChatroomLink>);
    fireEvent.focus(screen.getByRole("link", { name: "A" }));
    expect(recu.prefetch.at(-1)).toBeNull();
    unmount();

    recu.prefetch.length = 0;
    render(<ChatroomLink href="/c/3">B</ChatroomLink>);
    fireEvent.touchStart(screen.getByRole("link", { name: "B" }));
    expect(recu.prefetch.at(-1)).toBeNull();
  });
});
