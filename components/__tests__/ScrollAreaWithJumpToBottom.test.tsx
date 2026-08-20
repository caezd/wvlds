import { describe, it, expect } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ScrollAreaWithJumpToBottom } from "@/components/ScrollAreaWithJumpToBottom";

function getViewport(container: HTMLElement) {
  const el = container.querySelector("[data-radix-scroll-area-viewport]");
  if (!el) throw new Error("viewport introuvable");
  return el as HTMLElement;
}

/** jsdom ne calcule aucun layout réel : on force les métriques de scroll
 *  puis on déclenche l'event pour simuler un scroll utilisateur. */
function setScrollMetrics(
  el: HTMLElement,
  { scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: scrollTop });
  Object.defineProperty(el, "scrollHeight", { configurable: true, writable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, writable: true, value: clientHeight });
  fireEvent.scroll(el);
}

describe("ScrollAreaWithJumpToBottom — bouton « descendre »", () => {
  it("n'est pas interactif (pointer-events-none, tabIndex -1) quand on est déjà en bas", async () => {
    const { container, getByLabelText } = render(
      <ScrollAreaWithJumpToBottom>
        <div style={{ height: 2000 }}>contenu</div>
      </ScrollAreaWithJumpToBottom>,
    );
    const viewport = getViewport(container);
    setScrollMetrics(viewport, { scrollTop: 1000, scrollHeight: 1000, clientHeight: 1000 });

    const button = getByLabelText("Descendre");
    await waitFor(() => {
      expect(button.className).toContain("pointer-events-none");
    });
    expect(button).toHaveAttribute("tabindex", "-1");
    expect(button).toHaveAttribute("aria-hidden", "true");
  });

  it("redevient interactif dès qu'on s'éloigne du bas au-delà du seuil", async () => {
    const { container, getByLabelText } = render(
      <ScrollAreaWithJumpToBottom thresholdPx={100}>
        <div style={{ height: 2000 }}>contenu</div>
      </ScrollAreaWithJumpToBottom>,
    );
    const viewport = getViewport(container);
    // Loin du bas (distance > thresholdPx) : le bouton doit s'activer.
    setScrollMetrics(viewport, { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 });

    const button = getByLabelText("Descendre");
    await waitFor(() => {
      expect(button.className).toContain("pointer-events-auto");
    });
    expect(button).toHaveAttribute("tabindex", "0");
    expect(button).toHaveAttribute("aria-hidden", "false");
  });

  it("redevient non-interactif une fois de retour en bas (régression : restait cliquable alors qu'invisible)", async () => {
    const { container, getByLabelText } = render(
      <ScrollAreaWithJumpToBottom thresholdPx={100}>
        <div style={{ height: 2000 }}>contenu</div>
      </ScrollAreaWithJumpToBottom>,
    );
    const viewport = getViewport(container);
    const button = getByLabelText("Descendre");

    setScrollMetrics(viewport, { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 });
    await waitFor(() => expect(button.className).toContain("pointer-events-auto"));

    // Retour tout en bas : distance à zéro, sous le seuil.
    setScrollMetrics(viewport, { scrollTop: 800, scrollHeight: 1000, clientHeight: 200 });
    await waitFor(() => expect(button.className).toContain("pointer-events-none"));
    expect(button).toHaveAttribute("tabindex", "-1");
  });

  it("apparaît en glissant légèrement depuis le bas (translate-y) plutôt qu'en fondu seul", async () => {
    const { container, getByLabelText } = render(
      <ScrollAreaWithJumpToBottom thresholdPx={100}>
        <div style={{ height: 2000 }}>contenu</div>
      </ScrollAreaWithJumpToBottom>,
    );
    const viewport = getViewport(container);
    const wrapper = getByLabelText("Descendre").parentElement!;

    // Caché : décalé vers le bas, invisible.
    expect(wrapper.className).toContain("translate-y-2");
    expect(wrapper.className).toContain("opacity-0");

    setScrollMetrics(viewport, { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 });

    // Visible : revenu à sa position, opaque.
    await waitFor(() => expect(wrapper.className).toContain("opacity-100"));
    expect(wrapper.className).toContain("translate-y-0");
    expect(wrapper.className).not.toContain("translate-y-2");
  });

  it("est un carré arrondi (rounded-lg), pas un cercle", () => {
    const { getByLabelText } = render(
      <ScrollAreaWithJumpToBottom>
        <div style={{ height: 2000 }}>contenu</div>
      </ScrollAreaWithJumpToBottom>,
    );
    const button = getByLabelText("Descendre");
    expect(button.className).toContain("rounded-lg");
    expect(button.className).not.toContain("rounded-full");
  });
});
