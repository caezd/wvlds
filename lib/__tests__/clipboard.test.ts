import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** `navigator.clipboard` n'existe pas sous jsdom : on l'installe par test. */
function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

beforeEach(() => vi.clearAllMocks());

describe("copyToClipboard", () => {
  it("copie le texte et annonce le succès", async () => {
    const writeText = stubClipboard(async () => {});

    await copyToClipboard("#ff00aa", "copié", "raté");

    expect(writeText).toHaveBeenCalledWith("#ff00aa");
    expect(toast.success).toHaveBeenCalledWith("copié");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("signale l'échec au lieu de le laisser passer en silence", async () => {
    // `navigator.clipboard` rejette hors contexte sécurisé, ou quand
    // l'utilisateur refuse l'autorisation.
    stubClipboard(() => Promise.reject(new Error("NotAllowedError")));

    await expect(copyToClipboard("#ff00aa", "copié", "raté")).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledWith("raté");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
