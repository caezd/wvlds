import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { WorldAvatar } from "@/components/avatars/WorldAvatar";

describe("WorldAvatar", () => {
  it("demande une source assez large pour rester nette sur un écran haute densité", () => {
    // Régression : `px * 1.5` sous-dimensionnait la source demandée à
    // Supabase — flou dès qu'affiché sur un écran 2x/3x DPR, où `px` CSS ne
    // correspond plus au nombre de pixels physiques réellement rendus.
    const { container } = render(
      <WorldAvatar world={{ name: "Avalonia", icon_url: "https://x.supabase.co/storage/v1/object/public/icons/a.jpg" }} size="lg" />,
    );
    const img = container.querySelector("img")!;
    const src = decodeURIComponent(img.getAttribute("src") ?? "");
    const requestedWidth = Number(src.match(/[?&]width=(\d+)/)?.[1]);
    // size="lg" = 40px affichés — au moins 3x pour couvrir les écrans 3x DPR.
    expect(requestedWidth).toBeGreaterThanOrEqual(40 * 3);
  });

  it("affiche l'initiale du monde sans icône", () => {
    const { getByText, container } = render(<WorldAvatar world={{ name: "Avalonia", icon_url: null }} />);
    expect(getByText("A")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
