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

const activeWorldIdMock = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/components/providers/MobileSidebarProvider", () => ({
  useMobileSidebar: () => ({ activeWorldId: activeWorldIdMock.value }),
}));

beforeEach(() => {
  pathnameMock.value = "/personas";
  activeWorldIdMock.value = null;
});

const WORLDS = [
  { id: "world-1", name: "Final Cocktasy", icon_url: null },
  { id: "world-2", name: "Autre monde", icon_url: null },
];

describe("WorldsQuickAccess", () => {
  it("le bouton \"Mondes\" ramène au dernier monde visité (/w, point d'entrée dédié) sans cookie connu", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Mondes")).toHaveAttribute("href", "/w");
  });

  it("le bouton \"Mondes\" pointe directement vers /w/<id> quand le cookie last_world_id est connu", () => {
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" lastWorldId="world-9" />);

    expect(screen.getByLabelText("Mondes")).toHaveAttribute("href", "/w/world-9");
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
    // Sans favoris, le conteneur n'a pas le fond de carte — la pastille ne
    // doit pas se retrouver seule, sans boîte : le bouton porte lui-même le
    // fond actif dans ce cas.
    expect(link).toHaveClass("bg-carbon-700");
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

  it("désactive le favori déjà actif (/w/<id> courant) et ajoute un contour accent sur son icône, au lieu d'un lien", () => {
    pathnameMock.value = "/w/world-1";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    const current = screen.getByLabelText("Final Cocktasy");
    expect(current.tagName).not.toBe("A");
    expect(current).not.toHaveAttribute("href");
    expect(current).toHaveAttribute("aria-current", "page");
    // L'anneau épouse l'icône elle-même (l'avatar), pas la boîte 9x9 autour.
    expect(current).not.toHaveClass("ring-accent");
    expect(current.querySelector(".ring-accent")).toBeTruthy();

    // L'autre favori reste un lien cliquable normal, sans contour.
    const other = screen.getByLabelText("Autre monde");
    expect(other.tagName).toBe("A");
    expect(other).toHaveAttribute("href", "/w/world-2");
    expect(other.querySelector(".ring-accent")).toBeFalsy();
  });

  it("désactive aussi le favori actif depuis une chatroom de ce monde (activeWorldId)", () => {
    pathnameMock.value = "/c/chat-1";
    activeWorldIdMock.value = "world-2";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    const current = screen.getByLabelText("Autre monde");
    expect(current.tagName).not.toBe("A");
    expect(current.querySelector(".ring-accent")).toBeTruthy();
  });

  it("aucun favori désactivé quand on n'est pas dans un de ces mondes", () => {
    pathnameMock.value = "/personas";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Final Cocktasy").tagName).toBe("A");
    expect(screen.getByLabelText("Autre monde").tagName).toBe("A");
  });

  it("désactive le bouton \"Mondes\" quand le monde courant est déjà celui du cookie last_world_id", () => {
    pathnameMock.value = "/w/world-1";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" lastWorldId="world-1" />);

    const trigger = screen.getByLabelText("Mondes");
    expect(trigger.tagName).not.toBe("A");
    expect(trigger).not.toHaveAttribute("href");
    expect(trigger).toHaveAttribute("aria-current", "page");
  });

  it("garde le bouton \"Mondes\" cliquable quand le monde courant diffère de celui du cookie", () => {
    pathnameMock.value = "/w/world-2";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" lastWorldId="world-1" />);

    const trigger = screen.getByLabelText("Mondes");
    expect(trigger.tagName).toBe("A");
    expect(trigger).toHaveAttribute("href", "/w/world-1");
  });

  it("garde le bouton \"Mondes\" cliquable sans cookie connu, même dans un monde", () => {
    pathnameMock.value = "/w/world-1";
    render(<WorldsQuickAccess worlds={WORLDS} label="Mondes" />);

    expect(screen.getByLabelText("Mondes").tagName).toBe("A");
  });
});
