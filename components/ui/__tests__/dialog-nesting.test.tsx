import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Un menu ouvert depuis un modal (choix d'icône, d'emoji…) doit rester utilisable. */
function Harness() {
  return (
    <Dialog open>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Encadré</DialogTitle>
        <Popover>
          <PopoverTrigger>Icône</PopoverTrigger>
          <PopoverContent data-testid="picker">
            <input aria-label="Rechercher" />
          </PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>
  );
}

describe("Popover dans un Dialog", () => {
  it("le menu reçoit les clics et garde le focus de sa recherche", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Icône" }));

    // Le modal coupe les clics hors de lui ; le menu, reconnu comme couche
    // au-dessus, doit les rétablir pour lui-même.
    expect(document.body.style.pointerEvents).toBe("none");
    expect(screen.getByTestId("picker").style.pointerEvents).toBe("auto");

    const search = screen.getByRole("textbox", { name: "Rechercher" });
    await user.click(search);
    await user.keyboard("épée");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("épée");
  });
});
