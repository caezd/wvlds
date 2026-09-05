import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScaleCalibrator } from "@/components/worlds/map/ScaleCalibrator";

// ──────────────────────────────────────────────────────────────────────────
// Le segment ne sert qu'à une chose : dire ce que vaut une distance connue,
// pour que la carte en déduise la sienne. Il n'y a pas d'outil de mesure.
// ──────────────────────────────────────────────────────────────────────────

const A = { x: 0, y: 0 };
const B = { x: 25, y: 0 };
const KM = { widthUnits: 1000, unit: "km" };

function monter(props: Partial<React.ComponentProps<typeof ScaleCalibrator>> = {}) {
  const onCalibrate = vi.fn();
  const onClear = vi.fn();
  render(
    <ScaleCalibrator a={A} b={B} aspect={1} scale={null} onCalibrate={onCalibrate} onClear={onClear} {...props} />,
  );
  return { onCalibrate, onClear };
}

describe("ScaleCalibrator", () => {
  it("attend le second point", () => {
    monter({ b: null });

    expect(screen.getByText("Cliquez un second point, sur une distance connue")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(1);
    // Pas de trait tant qu'il n'y a qu'un point (les `svg` restants sont des icônes).
    expect(document.querySelector("line")).toBeNull();
  });

  it("déduit la largeur de la carte d'une distance déclarée", () => {
    // On mesure une distance connue, on dit combien elle fait : nul besoin de
    // connaître des pixels.
    const { onCalibrate } = monter();
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(2);

    return (async () => {
      await userEvent.type(screen.getByRole("spinbutton", { name: "Cette distance fait" }), "50");
      await userEvent.type(screen.getByRole("textbox", { name: "Unité" }), "lieues{Enter}");

      // 25 % de la largeur font 50 lieues : la carte en fait 200.
      expect(onCalibrate).toHaveBeenCalledWith(200, "lieues");
    })();
  });

  it("repart de l'échelle en place, pour la corriger", async () => {
    const { onCalibrate } = monter({ scale: KM });
    const champ = screen.getByRole("spinbutton", { name: "Cette distance fait" });
    expect(champ).toHaveValue(250);

    await userEvent.clear(champ);
    await userEvent.type(champ, "500");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onCalibrate).toHaveBeenCalledWith(2000, "km");
  });

  it("retire l'échelle quand on efface la valeur", async () => {
    const { onCalibrate } = monter({ scale: KM });

    await userEvent.clear(screen.getByRole("spinbutton", { name: "Cette distance fait" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onCalibrate).toHaveBeenCalledWith(null, "");
  });

  it("ne retient rien d'une distance absurde", async () => {
    const { onCalibrate } = monter();

    await userEvent.type(screen.getByRole("spinbutton", { name: "Cette distance fait" }), "0{Enter}");

    expect(onCalibrate).not.toHaveBeenCalled();
  });

  it("efface le segment", async () => {
    const { onClear } = monter();
    await userEvent.click(screen.getByRole("button", { name: "Effacer le segment" }));
    expect(onClear).toHaveBeenCalled();
  });
});
