import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CalloutBlockView } from "@/components/chatrooms/blocks/CalloutBlock";
import type { CalloutBlock } from "@/lib/chat-blocks";

function show(block: Partial<CalloutBlock>) {
  return render(<CalloutBlockView block={{ _type: "callout", ...block } as CalloutBlock} mine={false} />);
}

describe("CalloutBlockView — champs « clé : valeur »", () => {
  it("affiche chaque champ avec sa clé et sa valeur", () => {
    show({ title: "Scène", fields: [{ key: "Lieu", value: "Port de Sel" }, { key: "Météo", value: "Bruine" }] });
    expect(screen.getByText("Lieu")).toBeInTheDocument();
    expect(screen.getByText("Port de Sel")).toBeInTheDocument();
    expect(screen.getByText("Météo")).toBeInTheDocument();
    expect(screen.getByText("Bruine")).toBeInTheDocument();
  });

  it("en style séparateur aussi", () => {
    show({ border: "separator", title: "Scène", fields: [{ key: "Heure", value: "minuit" }] });
    expect(screen.getByText("Heure")).toBeInTheDocument();
    expect(screen.getByText("minuit")).toBeInTheDocument();
  });
});

describe("CalloutBlockView — encadré repliable", () => {
  it("replié, le titre se lit et le corps attend « Afficher la suite »", async () => {
    const user = userEvent.setup();
    show({ title: "Souvenir", text: "Une odeur de cire.", fields: [{ key: "Lieu", value: "Chapelle" }], collapsible: true });
    expect(screen.getByText("Souvenir")).toBeInTheDocument();
    expect(screen.queryByText("Une odeur de cire.")).not.toBeInTheDocument();
    expect(screen.queryByText("Chapelle")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Afficher la suite" }));
    expect(screen.getByText("Une odeur de cire.")).toBeInTheDocument();
    expect(screen.getByText("Chapelle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Replier" }));
    expect(screen.queryByText("Une odeur de cire.")).not.toBeInTheDocument();
  });

  it("non repliable, le corps se lit d'emblée", () => {
    show({ title: "Souvenir", text: "Une odeur de cire." });
    expect(screen.getByText("Une odeur de cire.")).toBeInTheDocument();
  });
});
