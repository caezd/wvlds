import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeasureOverlay } from "@/components/worlds/map/MeasureOverlay";

const A = { x: 0, y: 0 };
const B = { x: 25, y: 0 };
const KM = { widthUnits: 1000, unit: "km" };

function monter(props: Partial<React.ComponentProps<typeof MeasureOverlay>> = {}) {
  const onCalibrate = vi.fn();
  const onClear = vi.fn();
  render(
    <MeasureOverlay a={A} b={B} aspect={1} scale={KM} isEditMode={false} onCalibrate={onCalibrate} onClear={onClear} {...props} />,
  );
  return { onCalibrate, onClear };
}

describe("MeasureOverlay", () => {
  it("attend le second point", () => {
    monter({ b: null });
    expect(screen.getByText("Cliquez un second point")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-measure-point]")).toHaveLength(1);
    expect(document.querySelector("svg")).toBeNull();
  });

  it("dit la distance en unités du monde", () => {
    monter();
    expect(screen.getByText("250 km")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-measure-point]")).toHaveLength(2);
  });

  it("avoue quand la carte n'a pas d'échelle", () => {
    monter({ scale: null });
    expect(screen.getByText("Échelle non définie")).toBeInTheDocument();
  });

  it("règle l'échelle depuis une distance déclarée, en édition", async () => {
    // On mesure une distance connue, on dit combien elle fait : la carte en
    // déduit sa largeur. Nul besoin de connaître des pixels.
    const { onCalibrate } = monter({ scale: null, isEditMode: true });

    await userEvent.type(screen.getByRole("spinbutton", { name: "Cette distance fait" }), "50");
    await userEvent.type(screen.getByRole("textbox", { name: "Unité" }), "lieues{Enter}");

    // 25 % de la largeur font 50 lieues : la carte en fait 200.
    expect(onCalibrate).toHaveBeenCalledWith(200, "lieues");
  });

  it("repart de la mesure courante pour la corriger", async () => {
    const { onCalibrate } = monter({ isEditMode: true });
    const champ = screen.getByRole("spinbutton", { name: "Cette distance fait" });
    expect(champ).toHaveValue(250);

    await userEvent.clear(champ);
    await userEvent.type(champ, "500");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onCalibrate).toHaveBeenCalledWith(2000, "km");
  });

  it("retire l'échelle quand on efface la valeur", async () => {
    const { onCalibrate } = monter({ isEditMode: true });
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Cette distance fait" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onCalibrate).toHaveBeenCalledWith(null, "");
  });

  it("efface la mesure", async () => {
    const { onClear } = monter();
    await userEvent.click(screen.getByRole("button", { name: "Effacer la mesure" }));
    expect(onClear).toHaveBeenCalled();
  });
});
