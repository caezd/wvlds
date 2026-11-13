import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CalloutBlockView } from "@/components/chatrooms/blocks/CalloutBlock";
import type { CalloutBlock } from "@/lib/chat-blocks";

function surface(block: Partial<CalloutBlock>) {
  render(<CalloutBlockView block={{ _type: "callout", text: "Il pleut sur la ville.", ...block } as CalloutBlock} mine={false} />);
  return screen.getByText("Il pleut sur la ville.").closest('[class~="group/gblock"]') as HTMLElement;
}

describe("CalloutBlockView — bordure", () => {
  it("« complète » trace une bordure, teintée par l'accent", () => {
    const el = surface({ border: "full", accent: "#C084FC" });
    expect(el.className.split(" ")).toContain("border");
    expect(el.style.borderColor).toContain("color-mix");
  });

  it("« complète » sans accent garde une bordure neutre", () => {
    expect(surface({ border: "full" }).className.split(" ")).toContain("border");
  });

  it("« à gauche » ne trace que le filet de gauche", () => {
    const left = surface({ border: "left", accent: "#C084FC" });
    expect(left.className).toContain("border-l-4");
    expect(left.className.split(" ")).not.toContain("border");
  });

  it("l'arrondi ne dépasse pas rounded-lg", () => {
    expect(surface({ border: "full" }).className).toContain("rounded-lg");
  });
});
