import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Ouverte depuis le menu « Insérer un bloc », la fenêtre est contrôlée par
// son parent (`open`) : un nouvel encadré part d'une fenêtre vide, pas du
// contenu du précédent.

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="contenu" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("../CalloutBlock", () => ({ CalloutBlockView: () => null }));
vi.mock("@/components/chatrooms/reactions/EmojiPickerButton", () => ({ EmojiPickerButton: () => null }));
vi.mock("@/components/ui/LucideIconPicker", () => ({ LucideIconPicker: () => null }));

import { CalloutDialog } from "../CalloutDialog";

describe("CalloutDialog — fenêtre contrôlée", () => {
  it("rouverte après un envoi, elle repart vide", () => {
    const onSend = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(<CalloutDialog open onOpenChange={onOpenChange} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Souvenir" } });
    fireEvent.change(screen.getByLabelText("contenu"), { target: { value: "Une odeur de cire." } });
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(onSend).toHaveBeenCalledOnce();

    rerender(<CalloutDialog open={false} onOpenChange={onOpenChange} onSend={onSend} />);
    rerender(<CalloutDialog open onOpenChange={onOpenChange} onSend={onSend} />);
    expect(screen.getByPlaceholderText("callout.titlePlaceholder")).toHaveValue("");
    expect(screen.getByLabelText("contenu")).toHaveValue("");
  });
});
