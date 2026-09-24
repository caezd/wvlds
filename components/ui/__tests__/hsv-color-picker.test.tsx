import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HsvColorPicker, normalizeHex } from "@/components/ui/hsv-color-picker";

// jsdom ne dessine pas : le canvas du sélecteur n'a pas de contexte 2D.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement["getContext"];

describe("normalizeHex", () => {
  it("accepte six chiffres, avec ou sans dièse", () => {
    expect(normalizeHex("1D4ED8")).toBe("#1d4ed8");
    expect(normalizeHex("#1d4ed8")).toBe("#1d4ed8");
    expect(normalizeHex("  #1D4ED8  ")).toBe("#1d4ed8");
  });

  it("déplie la forme courte", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("f00")).toBe("#ff0000");
  });

  it("laisse tomber la transparence collée en queue", () => {
    expect(normalizeHex("#1d4ed8ff")).toBe("#1d4ed8");
  });

  it("rend null quand rien d'exploitable n'en sort", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("rgb(29, 78, 216)")).toBeNull();
    // Des lettres hexadécimales égarées dans une phrase n'en font pas un code.
    expect(normalizeHex("color: #1d4ed8;")).toBeNull();
  });
});

describe("HsvColorPicker — le code hexadécimal", () => {
  it("montre la couleur en cours, sans son dièse", () => {
    render(<HsvColorPicker color="#1d4ed8" onChange={vi.fn()} presets={[]} />);
    expect(screen.getByLabelText("hex")).toHaveValue("1D4ED8");
  });

  it("une frappe complète change la couleur ; une frappe en cours ne dit rien", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HsvColorPicker color="#1d4ed8" onChange={onChange} presets={[]} />);
    const champ = screen.getByLabelText("hex");

    await user.clear(champ);
    await user.type(champ, "ff");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(champ, "0000");
    expect(onChange).toHaveBeenLastCalledWith("#ff0000");
  });

  it("un collage se met en forme tout seul", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HsvColorPicker color="#1d4ed8" onChange={onChange} presets={[]} />);
    const champ = screen.getByLabelText("hex");

    await user.clear(champ);
    await user.paste("#8AE06C");

    expect(champ).toHaveValue("8AE06C");
    expect(onChange).toHaveBeenLastCalledWith("#8ae06c");
  });

  it("n'accepte que des chiffres hexadécimaux, six au plus", async () => {
    const user = userEvent.setup();
    render(<HsvColorPicker color="#1d4ed8" onChange={vi.fn()} presets={[]} />);
    const champ = screen.getByLabelText("hex");

    await user.clear(champ);
    await user.type(champ, "zz12g3456789");

    expect(champ).toHaveValue("123456");
  });

  it("une saisie inachevée revient à la couleur en cours à la sortie du champ", async () => {
    const user = userEvent.setup();
    render(<HsvColorPicker color="#1d4ed8" onChange={vi.fn()} presets={[]} />);
    const champ = screen.getByLabelText("hex");

    await user.clear(champ);
    await user.type(champ, "abc1");
    expect(champ).toHaveValue("ABC1");

    await user.tab();
    expect(champ).toHaveValue("1D4ED8");
  });
});
