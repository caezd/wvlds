import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  DEFAULT_COLOR_PRESETS,
  HsvColorPicker,
  hexToHsva,
  hsvaToHex,
  normalizeHexColor,
  parseHexColor,
  type ColorPreset,
} from "@/components/ui/hsv-color-picker";

const PRESETS: ColorPreset[] = [
  { label: "Noir", value: "#18181b" },
  { label: "Rouge", value: "#F56868" },
  { label: "Jaune", value: "#F1DF38" },
];

describe("conversions hex", () => {
  it("lit les formes à 3, 4, 6 et 8 chiffres", () => {
    expect(parseHexColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseHexColor("#1d4ed8")).toEqual({ r: 0x1d, g: 0x4e, b: 0xd8, a: 1 });
    expect(parseHexColor("#00000080")?.a).toBeCloseTo(0x80 / 255);
    expect(parseHexColor("#0008")?.a).toBeCloseTo(0x88 / 255);
    expect(parseHexColor("1d4ed8")).not.toBeNull();
  });

  it("rejette ce qui n'est pas une couleur hex", () => {
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("#zzzzzz")).toBeNull();
    expect(parseHexColor("red")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
  });

  it("normalise en minuscules, sans alpha par défaut", () => {
    expect(normalizeHexColor("#F56868")).toBe("#f56868");
    expect(normalizeHexColor("#ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("#7038F408")).toBe("#7038f4");
    expect(normalizeHexColor("#7038F408", true)).toBe("#7038f408");
    // Une couleur opaque reste à six chiffres même avec l'alpha activé.
    expect(normalizeHexColor("#7038F4FF", true)).toBe("#7038f4");
  });

  it("fait l'aller-retour hex → HSV → hex sans dériver", () => {
    for (const hex of ["#1d4ed8", "#f56868", "#2dd4bf", "#9aa0a6", "#000000", "#ffffff", "#7038f4"]) {
      const hsva = hexToHsva(hex);
      expect(hsva).not.toBeNull();
      expect(hsvaToHex(hsva!)).toBe(hex);
    }
  });

  it("n'écrit l'alpha que si demandé et non opaque", () => {
    expect(hsvaToHex({ h: 0, s: 1, v: 1, a: 0.5 })).toBe("#ff0000");
    expect(hsvaToHex({ h: 0, s: 1, v: 1, a: 0.5 }, true)).toBe("#ff000080");
    expect(hsvaToHex({ h: 0, s: 1, v: 1, a: 1 }, true)).toBe("#ff0000");
  });
});

describe("HsvColorPicker — palette", () => {
  it("affiche la palette par défaut et le sélecteur avancé ensemble", () => {
    render(<HsvColorPicker color="#123456" onChange={() => {}} />);
    const palette = screen.getByRole("group", { name: "Couleurs prédéfinies" });
    const labels = Array.from(palette.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(DEFAULT_COLOR_PRESETS.map((p) => p.label));
    expect(labels).toEqual(["Noir", "Rouge", "Orange", "Jaune", "Vert", "Bleu", "Violet", "Blanc"]);
    expect(screen.getByRole("slider", { name: "Saturation et luminosité" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Teinte" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Code hexadécimal" })).toHaveValue("#123456");
  });

  it("marque la couleur active d'un point", () => {
    render(<HsvColorPicker color="#f56868" onChange={() => {}} presets={PRESETS} />);
    const active = screen.getByRole("button", { name: "Rouge" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active.querySelector("[data-testid=color-preset-active-dot]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Noir" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId("color-preset-active-dot")).toHaveLength(1);
  });

  it("le point est sombre sur une pastille claire, clair sur une pastille sombre", () => {
    const { rerender } = render(<HsvColorPicker color="#F1DF38" onChange={() => {}} presets={PRESETS} />);
    expect(screen.getByTestId("color-preset-active-dot")).toHaveClass("bg-zinc-950");
    rerender(<HsvColorPicker color="#18181b" onChange={() => {}} presets={PRESETS} />);
    expect(screen.getByTestId("color-preset-active-dot")).toHaveClass("bg-white");
  });

  it("renvoie la valeur exacte du preset cliqué", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#f56868" onChange={onChange} presets={PRESETS} />);
    fireEvent.click(screen.getByRole("button", { name: "Jaune" }));
    expect(onChange).toHaveBeenCalledWith("#F1DF38");
  });

  it("presets={[]} retire la rangée de pastilles", () => {
    render(<HsvColorPicker color="#f56868" onChange={() => {}} presets={[]} />);
    expect(screen.queryByRole("group", { name: "Couleurs prédéfinies" })).toBeNull();
    expect(screen.getByRole("slider", { name: "Teinte" })).toBeInTheDocument();
  });

  it("dessine le panneau par défaut, pas avec framed={false}", () => {
    const { container, rerender } = render(<HsvColorPicker color="#f56868" onChange={() => {}} presets={[]} />);
    expect(container.firstElementChild).toHaveClass("rounded-2xl", "border");
    rerender(<HsvColorPicker color="#f56868" onChange={() => {}} presets={[]} framed={false} />);
    expect(container.firstElementChild).not.toHaveClass("rounded-2xl");
  });
});

describe("HsvColorPicker — sélecteur avancé", () => {
  it("le curseur de teinte change la teinte en gardant saturation et luminosité", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} />);
    fireEvent.change(screen.getByRole("slider", { name: "Teinte" }), { target: { value: "120" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");
  });

  it("la zone saturation/luminosité se pilote au clavier", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} />);
    const area = screen.getByRole("slider", { name: "Saturation et luminosité" });
    fireEvent.keyDown(area, { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(hsvaToHex({ h: 0, s: 0.9, v: 1, a: 1 }));
    fireEvent.keyDown(area, { key: "ArrowDown", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(hsvaToHex({ h: 0, s: 0.9, v: 0.9, a: 1 }));
  });

  it("garde la teinte quand la couleur passe au noir", () => {
    let current = "#1d4ed8";
    const onChange = vi.fn((hex: string) => { current = hex; });
    const { rerender } = render(<HsvColorPicker color={current} onChange={onChange} presets={[]} />);
    const area = screen.getByRole("slider", { name: "Saturation et luminosité" });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(area, { key: "ArrowDown", shiftKey: true });
      rerender(<HsvColorPicker color={current} onChange={onChange} presets={[]} />);
    }
    expect(current).toBe("#000000");
    const hue = Number((screen.getByRole("slider", { name: "Teinte" }) as HTMLInputElement).value);
    expect(hue).toBeGreaterThan(200);
  });

  it("applique un code hex saisi et signale une saisie invalide", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} />);
    const field = screen.getByRole("textbox", { name: "Code hexadécimal" });

    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "#00FF00" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");

    onChange.mockClear();
    fireEvent.change(field, { target: { value: "#00GG00" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveAttribute("aria-invalid", "true");

    fireEvent.blur(field);
    expect(field).toHaveValue("#00FF00");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("se resynchronise quand la couleur change de l'extérieur", () => {
    const { rerender } = render(<HsvColorPicker color="#ff0000" onChange={() => {}} presets={[]} />);
    rerender(<HsvColorPicker color="#2dd4bf" onChange={() => {}} presets={[]} />);
    expect(screen.getByRole("textbox", { name: "Code hexadécimal" })).toHaveValue("#2DD4BF");
  });
});

describe("HsvColorPicker — opacité", () => {
  it("n'a pas de curseur d'opacité par défaut et refuse un hex à huit chiffres", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} />);
    expect(screen.queryByRole("slider", { name: "Opacité" })).toBeNull();
    const field = screen.getByRole("textbox", { name: "Code hexadécimal" });
    fireEvent.change(field, { target: { value: "#00ff0080" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("avec alpha, le curseur d'opacité produit un hex à huit chiffres", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} alpha />);
    fireEvent.change(screen.getByRole("slider", { name: "Opacité" }), { target: { value: "50" } });
    expect(onChange).toHaveBeenLastCalledWith("#ff000080");
    expect(screen.getByRole("textbox", { name: "Code hexadécimal" })).toHaveValue("#FF000080");
  });

  it("avec alpha, une saisie à huit chiffres est acceptée", () => {
    const onChange = vi.fn();
    render(<HsvColorPicker color="#ff0000" onChange={onChange} presets={[]} alpha />);
    fireEvent.change(screen.getByRole("textbox", { name: "Code hexadécimal" }), { target: { value: "#7038F408" } });
    expect(onChange).toHaveBeenLastCalledWith("#7038f408");
  });
});
