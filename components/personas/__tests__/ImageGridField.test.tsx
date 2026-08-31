import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageGridField } from "@/components/personas/fields/ImageGridField";
import type { PersonaGridImage } from "@/types/personas";
// Le libellé passe par next-intl (mocké sur fr.json dans vitest.setup) : on le
// lit à la source plutôt que de recopier une apostrophe typographique.
import fr from "@/messages/fr.json";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
  })),
}));

const images: PersonaGridImage[] = [
  { id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3 },
  { id: "b", url: "https://x/b.png", x: 3, y: 0, w: 3 },
];

describe("ImageGridField", () => {
  it("affiche une tuile et une poignée de redimensionnement par image", () => {
    render(<ImageGridField fieldId="f1" personaId="p1" userId="u1" initialImages={images} onSave={vi.fn()} />);
    expect(screen.getAllByLabelText(fr.personas.deleteImage)).toHaveLength(2);
    expect(screen.getAllByLabelText("Redimensionner")).toHaveLength(2);
  });

  it("redimensionne une image en tandem avec sa voisine en glissant sa poignée", () => {
    const onSave = vi.fn();
    render(<ImageGridField fieldId="f1" personaId="p1" userId="u1" initialImages={images} onSave={onSave} />);

    const handle = screen.getAllByLabelText("Redimensionner")[0];
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    // Un grand déplacement se fait clamper à la borne (largeur totale de la
    // paire préservée, aucune des deux ne peut descendre sous MIN_IMAGE_W) —
    // le résultat est donc déterministe même si jsdom mesure une largeur de
    // conteneur nulle (pas de moteur de mise en page).
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100_000 }));
    window.dispatchEvent(new PointerEvent("pointerup"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as PersonaGridImage[];
    const a = saved.find((i) => i.id === "a")!;
    const b = saved.find((i) => i.id === "b")!;
    expect(a.w! + b.w!).toBe(6);
    expect(a.w).toBeGreaterThan(3);
    expect(b.w).toBeGreaterThanOrEqual(2);
  });

  it("agrandit une image seule sur sa ligne jusqu'à 100% de large via sa poignée", () => {
    const onSave = vi.fn();
    const solo: PersonaGridImage[] = [{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3 }];
    render(<ImageGridField fieldId="f1" personaId="p1" userId="u1" initialImages={solo} onSave={onSave} />);

    const handle = screen.getByLabelText("Redimensionner");
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    // Sans voisine, la borne haute est la largeur de grille totale (6
    // colonnes) — même sous un grand déplacement, "a" ne peut pas dépasser
    // 100% de la ligne.
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100_000 }));
    window.dispatchEvent(new PointerEvent("pointerup"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as PersonaGridImage[];
    expect(saved.find((i) => i.id === "a")!.w).toBe(6);
  });

  it("un simple clic sur la poignée, sans glissement, ne déclenche pas de sauvegarde", () => {
    const onSave = vi.fn();
    render(<ImageGridField fieldId="f1" personaId="p1" userId="u1" initialImages={images} onSave={onSave} />);

    const handle = screen.getAllByLabelText("Redimensionner")[0];
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    window.dispatchEvent(new PointerEvent("pointerup"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("supprime une image et compacte la grille", () => {
    const onSave = vi.fn();
    render(<ImageGridField fieldId="f1" personaId="p1" userId="u1" initialImages={images} onSave={onSave} />);

    fireEvent.click(screen.getAllByLabelText(fr.personas.deleteImage)[0]);

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as PersonaGridImage[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("b");
  });
});
