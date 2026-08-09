import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

function dispatchBeforeInstallPrompt() {
  const event = Object.assign(new Event("beforeinstallprompt"), {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  window.dispatchEvent(event);
  return event;
}

describe("useInstallPrompt", () => {
  it("démarre sans invite disponible et non installé", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    expect(result.current.installed).toBe(false);
  });

  it("capture beforeinstallprompt, annule le mini-infobar natif et expose canInstall", () => {
    const { result } = renderHook(() => useInstallPrompt());
    let event: ReturnType<typeof dispatchBeforeInstallPrompt>;

    act(() => { event = dispatchBeforeInstallPrompt(); });

    expect(event!.preventDefault).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall déclenche l'invite différée puis réinitialise canInstall", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let event: ReturnType<typeof dispatchBeforeInstallPrompt>;
    act(() => { event = dispatchBeforeInstallPrompt(); });

    await act(async () => { await result.current.promptInstall(); });

    expect(event!.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall sans invite en attente ne fait rien", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => { await result.current.promptInstall(); });
    expect(result.current.canInstall).toBe(false);
  });

  it("appinstalled marque l'app comme installée et efface l'invite en attente", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => { dispatchBeforeInstallPrompt(); });
    expect(result.current.canInstall).toBe(true);

    act(() => { window.dispatchEvent(new Event("appinstalled")); });

    expect(result.current.installed).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it("détecte le mode standalone au montage comme déjà installé", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));

    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.installed).toBe(true);
    expect(result.current.canInstall).toBe(false);

    window.matchMedia = original;
  });
});
