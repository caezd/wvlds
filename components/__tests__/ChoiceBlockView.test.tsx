import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChoiceBlockView } from "@/components/chatrooms/blocks/ChoiceBlock";
import type { ChoiceBlock } from "@/lib/chat-blocks";
import type { ChoiceVoteSummary } from "@/types/db";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const block: ChoiceBlock = {
  _type: "choice",
  question: "Où allons-nous ?",
  options: [
    { id: "north", label: "Nord" },
    { id: "south", label: "Sud" },
  ],
};

function cardFor(label: string) {
  return screen.getByText(label).closest("button")!;
}

describe("ChoiceBlockView", () => {
  it("affiche la question et une carte par option", () => {
    render(<ChoiceBlockView block={block} mine={false} votes={[]} onVote={vi.fn()} />);
    expect(screen.getByText("Où allons-nous ?")).toBeInTheDocument();
    expect(screen.getByText("Nord")).toBeInTheDocument();
    expect(screen.getByText("Sud")).toBeInTheDocument();
  });

  it("surligne la carte correspondant au vote de l'utilisateur courant", () => {
    const votes: ChoiceVoteSummary[] = [{ option_id: "north", count: 1, mine: true }];
    render(<ChoiceBlockView block={block} mine={false} votes={votes} onVote={vi.fn()} />);
    expect(cardFor("Nord").className).toContain("border-violet-500/50");
    expect(cardFor("Sud").className).not.toContain("border-violet-500/50");
  });

  it("appelle onVote avec l'id de l'option cliquée", () => {
    const onVote = vi.fn();
    render(<ChoiceBlockView block={block} mine={false} votes={[]} onVote={onVote} />);
    fireEvent.click(cardFor("Sud"));
    expect(onVote).toHaveBeenCalledWith("south");
  });

  it("désactive le vote pour l'auteur du message (mine=true)", () => {
    const onVote = vi.fn();
    render(<ChoiceBlockView block={block} mine={true} votes={[]} onVote={onVote} />);
    expect(cardFor("Nord")).toBeDisabled();
    fireEvent.click(cardFor("Nord"));
    expect(onVote).not.toHaveBeenCalled();
  });

  it("ne revote pas si l'utilisateur clique sur l'option déjà sienne", () => {
    const onVote = vi.fn();
    const votes: ChoiceVoteSummary[] = [{ option_id: "north", count: 1, mine: true }];
    render(<ChoiceBlockView block={block} mine={false} votes={votes} onVote={onVote} />);
    fireEvent.click(cardFor("Nord"));
    expect(onVote).not.toHaveBeenCalled();
  });

  it("calcule la largeur de la barre en pourcentage du total des votes", () => {
    const votes: ChoiceVoteSummary[] = [
      { option_id: "north", count: 3, mine: false },
      { option_id: "south", count: 1, mine: false },
    ];
    const { container } = render(<ChoiceBlockView block={block} mine={false} votes={votes} onVote={vi.fn()} />);
    const bars = container.querySelectorAll('[aria-hidden]');
    const northBar = cardFor("Nord").querySelector('[aria-hidden]') as HTMLElement;
    const southBar = cardFor("Sud").querySelector('[aria-hidden]') as HTMLElement;
    expect(bars.length).toBe(2);
    expect(northBar.style.width).toBe("75%");
    expect(southBar.style.width).toBe("25%");
  });
});
