import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorldsQuickAccess } from "@/components/sidebar/WorldsQuickAccess";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const pathnameMock = vi.hoisted(() => ({ value: "/personas" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
}));

beforeEach(() => {
  pathnameMock.value = "/personas";
});

const WORLDS = [
  { id: "world-1", name: "Final Cocktasy", icon_url: null },
  { id: "world-2", name: "Autre monde", icon_url: null },
];

describe("WorldsQuickAccess", () => {
  it("le bouton \"Mondes\" ramène au dernier monde visité (/, redirigé côté serveur)", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Mondes")).toHaveAttribute("href", "/");
  });

  it("affiche les mondes favoris (liés à /w/[id]) en permanence, sans avoir à cliquer", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Final Cocktasy")).toHaveAttribute("href", "/w/world-1");
    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("href", "/w/world-2");
  });

  it("n'affiche que le bouton \"Mondes\" quand aucun monde n'est en favori", () => {
    render(<WorldsQuickAccess worlds={[]} label="Mondes" />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("sans favoris, le bouton n'a pas le fond permanent — icône de rail normale", () => {
    render(<WorldsQuickAccess worlds={[]} label="Mondes" />);

    const link = screen.getByLabelText("Mondes");
    expect(link.parentElement).not.toHaveClass("bg-carbon-700");
    expect(link).not.toHaveClass("text-mist-50");
  });

  it("avec des favoris, le bouton porte le fond permanent de la carte", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    const link = screen.getByLabelText("Mondes");
    expect(link.parentElement).toHaveClass("bg-carbon-700");
  });

  it("affiche la pastille active dans un monde (/w/...), même sans favoris", () => {
    pathnameMock.value = "/w/world-1";
    render(<WorldsQuickAccess worlds={[]} label="Mondes" />);

    const link = screen.getByLabelText("Mondes");
    expect(link.querySelector("span.bg-mist-50")).toBeTruthy();
    expect(link).toHaveClass("text-mist-50");
  });

  it("affiche la pastille active dans une chatroom (/c/...)", () => {
    pathnameMock.value = "/c/chat-1";
    render(<WorldsQuickAccess worlds={[]} label="Mondes" />);

    expect(screen.getByLabelText("Mondes").querySelector("span.bg-mist-50")).toBeTruthy();
  });

  it("masque la pastille active hors des pages monde/chatroom", () => {
    pathnameMock.value = "/personas";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Mondes").querySelector("span.bg-mist-50")).toBeFalsy();
  });
});
