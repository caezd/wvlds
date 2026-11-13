import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string>) => (v ? `${k}:${Object.values(v).join("|")}` : k),
}));
vi.mock("../useProfileNames", () => ({ useProfileNames: () => ({ a: "Alice", b: "Bob", c: "Cora" }) }));

import { ChatroomTurnBar } from "../ChatroomTurnBar";

const turn = { chat_id: "c1", enabled: true, order_user_ids: ["a", "b", "c"], current_index: 0 };

describe("ChatroomTurnBar", () => {
  it("annonce « à vous de jouer » au joueur courant", () => {
    render(<ChatroomTurnBar turn={turn} selfId="a" canManage={false} onSkip={vi.fn()} />);
    expect(screen.getByTestId("turn-bar")).toHaveTextContent("turnYours");
    expect(screen.queryByText("turnSkip")).toBeNull();
  });

  it("indique à qui c'est le tour, et les suivants", () => {
    render(<ChatroomTurnBar turn={turn} selfId="b" canManage={false} onSkip={vi.fn()} />);
    expect(screen.getByText("turnOf:Alice")).toBeInTheDocument();
    expect(screen.getByTestId("turn-bar")).toHaveTextContent("turnNext:Bob, Cora");
  });

  it("qui règle l'ordre peut passer le tour", () => {
    const onSkip = vi.fn();
    render(<ChatroomTurnBar turn={turn} selfId="b" canManage onSkip={onSkip} />);
    fireEvent.click(screen.getByText("turnSkip"));
    expect(onSkip).toHaveBeenCalled();
  });

  it("rien quand l'ordre est inactif", () => {
    const { container } = render(<ChatroomTurnBar turn={{ ...turn, enabled: false }} selfId="a" canManage onSkip={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
