import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Categories } from "emoji-picker-react";
import { EMOJI_CATEGORY_ICONS } from "../emojiPickerCategoryIcons";
import { EmojiPickerFrame } from "../EmojiPickerFrame";
import { ChatReactionPicker } from "../ChatReactionPicker";
import { EmojiPickerButton } from "../EmojiPickerButton";

// La librairie et ses données de locale sont lourdes et inutiles ici : seul
// nous intéresse ce que les composants de wvlds posent autour d'elles.
vi.mock("emoji-picker-react", async () => {
  const actual = await vi.importActual<typeof import("emoji-picker-react")>(
    "emoji-picker-react",
  );
  return {
    ...actual,
    default: (props: Record<string, unknown>) => (
      <div
        data-testid="emoji-picker"
        data-categories={Object.keys(props.categoryIcons ?? {}).join(",")}
        data-search-placeholder={String(props.searchPlaceholder ?? "")}
      />
    ),
  };
});
vi.mock("emoji-picker-react/dist/data/emojis-fr.js", () => ({ default: {} }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("habillage du sélecteur d'emoji", () => {
  it("couvre toutes les catégories de la librairie", () => {
    // Une catégorie oubliée retomberait sur le sprite de la librairie, dont
    // l'état actif est bleu : un onglet dépareillé au milieu des autres.
    expect(Object.keys(EMOJI_CATEGORY_ICONS).sort()).toEqual(
      Object.values(Categories).sort(),
    );
  });

  it("retient la molette pour ne pas faire défiler la page derrière", () => {
    render(
      <EmojiPickerFrame>
        <span>contenu</span>
      </EmojiPickerFrame>,
    );

    const frame = document.querySelector(".wvlds-emoji-picker");
    expect(frame).not.toBeNull();

    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    const seenByParent = vi.fn();
    document.body.addEventListener("wheel", seenByParent);
    fireEvent(screen.getByText("contenu"), wheel);
    document.body.removeEventListener("wheel", seenByParent);

    expect(seenByParent).not.toHaveBeenCalled();
  });

  it("passe le sélecteur de réactions par l'enveloppe habillée", async () => {
    render(<ChatReactionPicker onSelect={() => {}} />);

    const picker = await screen.findByTestId("emoji-picker");
    expect(picker.closest(".wvlds-emoji-picker")).not.toBeNull();
    expect(picker.dataset.categories).toContain(Categories.SMILEYS_PEOPLE);
  });

  it("passe le bouton emoji par l'enveloppe habillée, recherche traduite", async () => {
    render(<EmojiPickerButton value="" onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "pickEmoji" }));

    await waitFor(() => {
      const picker = screen.getByTestId("emoji-picker");
      expect(picker.closest(".wvlds-emoji-picker")).not.toBeNull();
      expect(picker.dataset.searchPlaceholder).toBe("search");
    });
  });
});
