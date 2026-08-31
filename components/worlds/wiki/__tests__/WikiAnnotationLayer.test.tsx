import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WikiAnnotationLayer } from "@/components/worlds/wiki/WikiAnnotationLayer";
import type { WikiAnnotation, WikiAnnotationThread } from "@/types/worlds";

const TEXT = "Mara Kline observe la ville. Les Gardiens veillent sur Meridian.";

function thread(over: Partial<WikiAnnotation> & { id: string; anchor_quote: string }): WikiAnnotationThread {
  const start = TEXT.indexOf(over.anchor_quote);
  return {
    root: {
      page_id: "p1",
      parent_id: null,
      author_id: "u1",
      body: "Un commentaire",
      anchor_prefix: TEXT.slice(Math.max(0, start - 40), start),
      anchor_suffix: TEXT.slice(start + over.anchor_quote.length, start + over.anchor_quote.length + 40),
      anchor_start: start,
      resolved_at: null,
      resolved_by: null,
      created_at: "2026-08-01T10:00:00.000Z",
      author: { id: "u1", username: "caedrik", avatar_url: null },
      ...over,
    },
    replies: [],
  };
}

function renderLayer(props: Partial<React.ComponentProps<typeof WikiAnnotationLayer>> = {}) {
  return render(
    <WikiAnnotationLayer
      contentKey="p1|v1"
      threads={[]}
      active={null}
      draftAnchor={null}
      canComment
      onActivate={vi.fn()}
      onDraft={vi.fn()}
      {...props}
    >
      <p data-testid="prose">{TEXT}</p>
    </WikiAnnotationLayer>,
  );
}

/** Sélectionne `quote` dans le texte rendu, comme le ferait un glissé souris. */
function selectQuote(quote: string) {
  const prose = screen.getByTestId("prose");
  const node = prose.firstChild as Text;
  const start = node.nodeValue!.indexOf(quote);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + quote.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return prose;
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe("WikiAnnotationLayer — surlignage", () => {
  it("enveloppe le passage ancré sans altérer le texte de la page", () => {
    const { container } = renderLayer({ threads: [thread({ id: "a1", anchor_quote: "Les Gardiens" })] });

    const mark = container.querySelector<HTMLElement>('[data-annotation-id="a1"]');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("Les Gardiens");
    expect(screen.getByTestId("prose").textContent).toBe(TEXT);
  });

  it("marque un fil résolu", () => {
    const { container } = renderLayer({
      threads: [thread({ id: "a1", anchor_quote: "Meridian", resolved_at: "2026-08-02T10:00:00.000Z" })],
    });
    expect(
      container.querySelector<HTMLElement>('[data-annotation-id="a1"]')!.dataset.annotationResolved,
    ).toBe("true");
  });

  it("surligne deux passages qui se chevauchent sans décaler le texte", () => {
    const { container } = renderLayer({
      threads: [
        thread({ id: "a1", anchor_quote: "Les Gardiens veillent" }),
        thread({ id: "a2", anchor_quote: "veillent sur Meridian" }),
      ],
    });

    expect(container.querySelector('[data-annotation-id="a1"]')).not.toBeNull();
    expect(container.querySelector('[data-annotation-id="a2"]')).not.toBeNull();
    expect(screen.getByTestId("prose").textContent).toBe(TEXT);
  });

  it("signale les annotations dont l'extrait a disparu du texte", () => {
    const onDetachedChange = vi.fn();
    renderLayer({
      threads: [
        thread({ id: "a1", anchor_quote: "Les Gardiens" }),
        thread({ id: "perdue", anchor_quote: "Les Sentinelles" }),
      ],
      onDetachedChange,
    });

    expect(onDetachedChange).toHaveBeenCalledWith(["perdue"]);
  });

  it("n'applique qu'une série de surlignages par rendu, même après un nouveau rendu du parent", () => {
    const threads = [thread({ id: "a1", anchor_quote: "Les Gardiens" })];
    const { container, rerender } = renderLayer({ threads });

    // Nouveau rendu du parent, mêmes données : la couche ne doit pas
    // superposer une seconde série de span sur le DOM déjà enveloppé.
    rerender(
      <WikiAnnotationLayer
        contentKey="p1|v1"
        threads={[...threads]}
        active={null}
        draftAnchor={null}
        canComment
          onActivate={vi.fn()}
        onDraft={vi.fn()}
      >
        <p data-testid="prose">{TEXT}</p>
      </WikiAnnotationLayer>,
    );

    expect(container.querySelectorAll('[data-annotation-id="a1"]')).toHaveLength(1);
    expect(screen.getByTestId("prose").textContent).toBe(TEXT);
  });

  it("met en avant l'annotation courante", () => {
    const th = thread({ id: "a1", anchor_quote: "Les Gardiens" });
    const { container } = renderLayer({
      threads: [th],
      active: { id: "a1", scrollIntoView: false },
    });
    expect(
      container.querySelector<HTMLElement>('[data-annotation-id="a1"]')!.dataset.annotationActive,
    ).toBe("true");
  });
});

describe("WikiAnnotationLayer — clic sur un passage annoté", () => {
  it("active le fil correspondant", async () => {
    const onActivate = vi.fn();
    const { container } = renderLayer({
      threads: [thread({ id: "a1", anchor_quote: "Les Gardiens" })],
      onActivate,
    });

    await userEvent.click(container.querySelector('[data-annotation-id="a1"]')!);
    expect(onActivate).toHaveBeenCalledWith("a1");
  });
});

describe("WikiAnnotationLayer — sélection", () => {
  it("propose de commenter le passage sélectionné", async () => {
    renderLayer();
    fireEvent.mouseUp(selectQuote("Les Gardiens"));

    expect(await screen.findByRole("button", { name: "Commenter" })).toBeTruthy();
  });

  it("ancre la sélection sur l'extrait choisi", async () => {
    const onDraft = vi.fn();
    renderLayer({ onDraft });
    fireEvent.mouseUp(selectQuote("Les Gardiens"));

    await userEvent.click(await screen.findByRole("button", { name: "Commenter" }));

    expect(onDraft).toHaveBeenCalledTimes(1);
    const [anchor] = onDraft.mock.calls[0];
    expect(anchor.quote).toBe("Les Gardiens");
    expect(anchor.start).toBe(TEXT.indexOf("Les Gardiens"));
    expect(anchor.prefix).toBe("Mara Kline observe la ville. ");
  });

  it("ne propose rien sur une sélection vide", () => {
    renderLayer();
    fireEvent.mouseUp(screen.getByTestId("prose"));

    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
  });

  it("ne propose rien à qui ne peut ni commenter ni annoter", () => {
    renderLayer({ canComment: false });
    fireEvent.mouseUp(selectQuote("Meridian"));

    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
  });
});
