import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoredImage } from "@/components/ui/stored-image";
import { supabaseThumb, supabaseTinyThumb } from "@/lib/storage";

const STOCKÉE = "https://x.supabase.co/storage/v1/object/public/personas/avatars/p1.webp";

function Cadre({ children }: { children: React.ReactNode }) {
  return <div className="relative h-32 w-32 overflow-hidden">{children}</div>;
}

function img() {
  return document.querySelector("img") as HTMLImageElement;
}

afterEach(() => {
  // Le stub de `complete` est posé sur le prototype par certains tests.
  Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
});

describe("StoredImage", () => {
  it("affiche un substitut flou, et garde l'image invisible tant qu'elle n'est pas chargée", () => {
    render(<StoredImage url={STOCKÉE} width={384} />, { wrapper: Cadre });

    const flou = screen.getByTestId("stored-image-blur");
    expect(flou.style.backgroundImage).toContain(supabaseTinyThumb(STOCKÉE)!);
    expect(img().className).toContain("opacity-0");
  });

  it("fait apparaître l'image en fondu une fois chargée", async () => {
    render(<StoredImage url={STOCKÉE} width={384} />, { wrapper: Cadre });

    fireEvent.load(img());

    await waitFor(() => expect(img().className).toContain("opacity-100"));
    expect(img().className).toContain("transition-opacity");
  });

  // Sans cette vérification, une image servie par le cache — déjà complète
  // avant que React n'attache son `onLoad` — n'émettrait jamais l'événement et
  // resterait invisible pour toujours.
  it("affiche immédiatement une image déjà présente en cache", () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });

    render(<StoredImage url={STOCKÉE} width={384} />, { wrapper: Cadre });

    expect(img().className).toContain("opacity-100");
  });

  // `supabaseThumb` renvoie l'URL telle quelle pour un PNG ou un lien externe.
  // S'en servir comme substitut téléchargerait l'image entière deux fois.
  it("n'affiche aucun substitut quand l'URL n'est pas transformable", () => {
    for (const url of [
      "https://x.supabase.co/storage/v1/object/public/personas/a.png",
      "https://exemple.fr/photo.jpg",
    ]) {
      const { unmount } = render(<StoredImage url={url} width={384} />, { wrapper: Cadre });
      expect(screen.queryByTestId("stored-image-blur")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("repasse à l'image d'origine si le redimensionnement échoue", async () => {
    render(<StoredImage url={STOCKÉE} width={384} />, { wrapper: Cadre });
    expect(img().getAttribute("src")).toBe(supabaseThumb(STOCKÉE, 384, undefined));

    fireEvent.error(img());

    await waitFor(() => expect(img().getAttribute("src")).toBe(STOCKÉE));
  });

  // Sans réinitialisation, une image remplacée hériterait du `loaded` de la
  // précédente : elle apparaîtrait d'un coup, sans substitut ni fondu.
  it("refait son fondu quand l'image change", async () => {
    const AUTRE = STOCKÉE.replace("p1", "p2");
    const { rerender } = render(<StoredImage url={STOCKÉE} width={384} />, { wrapper: Cadre });

    fireEvent.load(img());
    await waitFor(() => expect(img().className).toContain("opacity-100"));

    rerender(<StoredImage url={AUTRE} width={384} />);

    expect(img().className).toContain("opacity-0");
    expect(screen.getByTestId("stored-image-blur").style.backgroundImage).toContain(
      supabaseTinyThumb(AUTRE)!,
    );
  });
  it("ne rend rien sans URL", () => {
    const { container } = render(<StoredImage url={null} width={384} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("demande une vignette au même cadrage que l'image, quand une hauteur est imposée", () => {
    render(<StoredImage url={STOCKÉE} width={920} height={272} />, { wrapper: Cadre });

    // 272 × 16 / 920 ≈ 5 : le substitut garde les proportions de la bannière
    // au lieu d'en montrer un carré.
    expect(screen.getByTestId("stored-image-blur").style.backgroundImage).toContain("height=5");
  });
});
