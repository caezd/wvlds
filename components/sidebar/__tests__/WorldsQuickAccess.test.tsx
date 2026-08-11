import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldsQuickAccess } from "@/components/sidebar/WorldsQuickAccess";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const WORLDS = [
  { id: "world-1", name: "Final Cocktasy", icon_url: null },
  { id: "world-2", name: "Autre monde", icon_url: null },
];

describe("WorldsQuickAccess", () => {
  it("n'affiche aucun monde tant que le panneau n'est pas déplié", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.queryByLabelText("Final Cocktasy")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mondes")).toHaveAttribute("aria-expanded", "false");
  });

  it("déplie les mondes favoris (liés à /w/[id]) au clic sur le bouton", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    fireEvent.click(screen.getByLabelText("Mondes"));

    expect(screen.getByLabelText("Mondes")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Final Cocktasy")).toHaveAttribute("href", "/w/world-1");
    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("href", "/w/world-2");
  });

  it("replie le panneau au second clic", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    const trigger = screen.getByLabelText("Mondes");
    fireEvent.click(trigger);
    expect(screen.getByLabelText("Final Cocktasy")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByLabelText("Final Cocktasy")).not.toBeInTheDocument();
  });

  it("n'affiche rien sous le bouton quand aucun monde n'est en favori", () => {
    render(<WorldsQuickAccess worlds={[]} label="Mondes" />);

    fireEvent.click(screen.getByLabelText("Mondes"));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
