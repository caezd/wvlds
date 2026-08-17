import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { WorldAnnouncementWidget } from "@/components/worlds/home/widgets/WorldAnnouncementWidget";

describe("WorldAnnouncementWidget — sécurité de l'iframe", () => {
  it("le sandbox n'accorde jamais allow-scripts, quel que soit le contenu", () => {
    const { container } = render(
      <WorldAnnouncementWidget
        worldId="w1"
        canAdmin={false}
        html="<script>alert(1)</script><div onclick='alert(2)'>x</div>"
        size="md"
      />,
    );
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-scripts");
  });

  it("rend le HTML fourni tel quel via srcDoc, dans un cadre isolé", () => {
    const html = "<style>body{color:red}</style><p>Bienvenue</p>";
    const { container } = render(
      <WorldAnnouncementWidget worldId="w1" canAdmin={false} html={html} size="md" />,
    );
    const iframe = container.querySelector("iframe")! as HTMLIFrameElement;
    expect(iframe.srcdoc).toBe(html);
  });
});

describe("WorldAnnouncementWidget — hauteur selon la taille choisie", () => {
  it.each([
    ["sm", "160px"],
    ["md", "280px"],
    ["lg", "420px"],
  ] as const)("taille %s → hauteur %s", (size, expectedHeight) => {
    const { container } = render(
      <WorldAnnouncementWidget worldId="w1" canAdmin={false} html="<p>x</p>" size={size} />,
    );
    const iframe = container.querySelector("iframe")! as HTMLIFrameElement;
    expect(iframe.style.height).toBe(expectedHeight);
  });
});

describe("WorldAnnouncementWidget — visibilité et édition via Réglages", () => {
  it("n'affiche rien pour un visiteur non-admin quand il n'y a pas d'annonce", () => {
    const { container } = render(
      <WorldAnnouncementWidget worldId="w1" canAdmin={false} html={null} size="md" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("propose un lien vers Réglages à un admin quand il n'y a pas d'annonce", () => {
    render(<WorldAnnouncementWidget worldId="w1" canAdmin size="md" html={null} />);
    const link = screen.getByText("Ajouter une annonce").closest("a")!;
    expect(link).toHaveAttribute("href", "/w/w1?view=settings");
  });

  it("n'affiche pas de lien d'édition pour un non-admin même avec une annonce", () => {
    render(<WorldAnnouncementWidget worldId="w1" canAdmin={false} html="<p>x</p>" size="md" />);
    expect(screen.queryByLabelText("Modifier l'annonce")).not.toBeInTheDocument();
  });

  it("le crayon d'un admin pointe vers l'onglet Réglages > Page d'accueil", () => {
    render(<WorldAnnouncementWidget worldId="w1" canAdmin html="<p>x</p>" size="md" />);
    expect(screen.getByLabelText("Modifier l'annonce")).toHaveAttribute("href", "/w/w1?view=settings");
  });
});
