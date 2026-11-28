import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// Les nouveaux réglages de l'encadré partent bien dans le bloc envoyé.

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

function sent(onSend: ReturnType<typeof vi.fn>) {
  return JSON.parse(onSend.mock.calls[0][0] as string);
}

describe("CalloutDialog — réglages", () => {
  it("les champs « clé : valeur » remplis partent avec l'encadré, les vides non", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.click(screen.getByRole("button", { name: "callout.fieldsAdd" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.fieldsAdd" }));
    const keys = screen.getAllByPlaceholderText("callout.fieldKeyPlaceholder");
    const values = screen.getAllByPlaceholderText("callout.fieldValuePlaceholder");
    fireEvent.change(keys[0], { target: { value: "Lieu" } });
    fireEvent.change(values[0], { target: { value: "Port de Sel" } });
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend).fields).toEqual([{ key: "Lieu", value: "Port de Sel" }]);
  });

  it("les options avancées (côtés, trait, arrondi, italique) partent avec l'encadré", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    const sides = within(screen.getByRole("group", { name: "callout.sidesLabel" }));
    fireEvent.click(sides.getByRole("button", { name: "callout.alignRight" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.styleDotted" }));
    const radius = within(screen.getByRole("group", { name: "callout.borderRound" }));
    fireEvent.click(radius.getByRole("button", { name: "callout.levelStrong" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.layoutLabel" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.bodyItalic" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend)).toMatchObject({
      sides: ["top", "bottom", "left"],
      borderStyle: "dotted",
      radius: "round",
      bodyItalic: true,
    });
  });

  it("le curseur règle l'intensité du fond, au pour cent près", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    const slider = screen.getByRole("slider", { name: "callout.bgIntensityLabel" });
    expect(slider).toHaveValue("8");
    fireEvent.change(slider, { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend).bgIntensity).toBe(35);
  });

  it("le curseur règle le voile de l'image", () => {
    const onSend = vi.fn();
    render(
      <CalloutDialog
        open
        onOpenChange={() => {}}
        onSend={onSend}
        initialBlock={{ _type: "callout", title: "Scène", image: "https://exemple.test/port.png" }}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    const slider = screen.getByRole("slider", { name: "callout.imageVeilLabel" });
    expect(slider).toHaveValue("50");
    fireEvent.change(slider, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "callout.save" }));
    expect(sent(onSend).imageVeil).toBe(20);
  });

  it("la forme « Séparateur » se choisit à côté du cadre", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    const shape = within(screen.getByRole("group", { name: "callout.borderShapeLabel" }));
    fireEvent.click(shape.getByRole("button", { name: "callout.borderSeparator" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend).border).toBe("separator");
  });

  it("« Gauche » ne garde que le côté gauche, « Tous » les rend tous", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    const quick = within(screen.getByRole("group", { name: "callout.sidesQuick" }));
    fireEvent.click(quick.getByRole("button", { name: "callout.alignLeft" }));
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend).border).toBe("left");
    expect(sent(onSend).sides).toBeUndefined();
  });

  it("un encadré qui garde tous les réglages par défaut n'en écrit aucun", () => {
    const onSend = vi.fn();
    render(<CalloutDialog open onOpenChange={() => {}} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("callout.titlePlaceholder"), { target: { value: "Scène" } });
    fireEvent.click(screen.getByRole("button", { name: "callout.insert" }));
    expect(sent(onSend)).toEqual({ _type: "callout", border: "full", align: "left", title: "Scène" });
  });

  it("rouvert sur un encadré, l'onglet Style montre ses réglages", () => {
    render(
      <CalloutDialog
        open
        onOpenChange={() => {}}
        onSend={() => {}}
        initialBlock={{ _type: "callout", title: "Scène", borderStyle: "dashed" }}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "callout.tabStyle" }));
    expect(screen.getByRole("button", { name: "callout.styleDashed" })).toHaveAttribute("aria-pressed", "true");
  });
});
