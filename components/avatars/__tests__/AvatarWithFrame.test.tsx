import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Radix ne monte son <img> qu'une fois l'image chargée, ce que jsdom ne fait
// jamais : sans ce remplacement il n'y aurait aucune balise à interroger.
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  AvatarImage: (props: React.ComponentProps<"img">) => <img alt="" {...props} />,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";

const SRC = "https://x.supabase.co/storage/v1/object/public/personas/a.webp";

describe("AvatarWithFrame", () => {
  it("demande une source assez large pour rester nette sur un écran haute densité", () => {
    // Régression : `size * 2` sous-dimensionnait la source demandée à
    // Supabase. Un avatar de profil (128 px CSS) recevait une image de 256 px,
    // étirée de 50 % sur un écran 3x DPR — même défaut que celui corrigé sur
    // WorldAvatar, qui demandait `px * 1.5`.
    const { container } = render(<AvatarWithFrame src={SRC} size={128} />);
    const img = container.querySelector("img")!;
    const src = decodeURIComponent(img.getAttribute("src") ?? "");
    const largeurDemandée = Number(src.match(/[?&]width=(\d+)/)?.[1]);
    expect(largeurDemandée).toBeGreaterThanOrEqual(128 * 3);
  });

  it("s'applique aussi aux petits avatars, où le flou se voit tout autant", () => {
    const { container } = render(<AvatarWithFrame src={SRC} size={24} />);
    const src = decodeURIComponent(container.querySelector("img")!.getAttribute("src") ?? "");
    expect(Number(src.match(/[?&]width=(\d+)/)?.[1])).toBeGreaterThanOrEqual(24 * 3);
  });
});
