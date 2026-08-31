import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ChatroomMessageMobileDrawers } from "../message/ChatroomMessageMobileDrawers";

function spyOnClipboard() {
  return vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
}

const BASE_PROPS = {
  mine: false,
  content: "Bonjour !",
  drawerOpen: true,
  setDrawerOpen: vi.fn(),
  emojiPickerOpen: false,
  setEmojiPickerOpen: vi.fn(),
  startEdit: vi.fn(),
  toggleReaction: vi.fn(),
};

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("ChatroomMessageMobileDrawers — copie de la couleur de dialogue", () => {
  it("propose l'option quand dialogueColor est défini, et copie au clic", async () => {
    const user = userEvent.setup();
    render(<ChatroomMessageMobileDrawers {...BASE_PROPS} dialogueColor="#ff00aa" />);
    const writeText = spyOnClipboard();

    await user.click(screen.getByText("Copier la couleur de dialogue"));

    expect(writeText).toHaveBeenCalledWith("#ff00aa");
    expect(toast.success).toHaveBeenCalledWith("Couleur copiée dans le presse-papiers.");
  });

  it("n'affiche pas l'option quand dialogueColor est absent", () => {
    render(<ChatroomMessageMobileDrawers {...BASE_PROPS} dialogueColor={null} />);

    expect(screen.queryByText("Copier la couleur de dialogue")).not.toBeInTheDocument();
  });
});
