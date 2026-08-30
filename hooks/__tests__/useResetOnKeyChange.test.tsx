import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";

describe("useResetOnKeyChange", () => {
  it("ne rejoue pas la graine au montage", () => {
    const seed = vi.fn();
    renderHook(() => useResetOnKeyChange("a", seed));
    expect(seed).not.toHaveBeenCalled();
  });

  it("ne rejoue pas la graine quand la clé est stable", () => {
    const seed = vi.fn();
    const { rerender } = renderHook(({ k }: { k: string }) => useResetOnKeyChange(k, seed), {
      initialProps: { k: "a" },
    });
    rerender({ k: "a" });
    rerender({ k: "a" });
    expect(seed).not.toHaveBeenCalled();
  });

  it("rejoue la graine une seule fois par changement de clé", () => {
    const seed = vi.fn();
    const { rerender } = renderHook(({ k }: { k: string }) => useResetOnKeyChange(k, seed), {
      initialProps: { k: "a" },
    });
    rerender({ k: "b" });
    expect(seed).toHaveBeenCalledTimes(1);
    rerender({ k: "b" });
    expect(seed).toHaveBeenCalledTimes(1);
    rerender({ k: "c" });
    expect(seed).toHaveBeenCalledTimes(2);
  });

  it("le nouvel état est visible dès le premier rendu suivant le changement", () => {
    // C'est tout l'intérêt par rapport à un `useEffect([key])` : aucune image
    // intermédiaire ne montre la valeur de la page quittée.
    const renders: string[] = [];
    const { result, rerender } = renderHook(
      ({ k, seedValue }: { k: string; seedValue: string }) => {
        const [value, setValue] = useState(seedValue);
        useResetOnKeyChange(k, () => setValue(seedValue));
        renders.push(value);
        return value;
      },
      { initialProps: { k: "a", seedValue: "monde-a" } },
    );

    expect(result.current).toBe("monde-a");
    renders.length = 0;

    act(() => { rerender({ k: "b", seedValue: "monde-b" }); });

    expect(result.current).toBe("monde-b");
    // React reprend le rendu avant de peindre : la valeur périmée n'est jamais
    // committée, donc jamais affichée.
    expect(renders.at(-1)).toBe("monde-b");
  });
});
