import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandItem, CommandList } from "@/components/ui/command";

describe("Checkbox", () => {
  it("dans une ligne de liste, la coche garde la couleur de la case (pas le gris des icônes)", () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>
            <Checkbox checked aria-label="test" />
            test
          </CommandItem>
        </CommandList>
      </Command>,
    );
    const check = screen.getByRole("checkbox", { name: "test" }).querySelector("svg")!;
    // La règle de CommandItem ne vise que les svg sans classe `text-*`.
    expect(check.getAttribute("class")).toContain("text-current");
  });
});
