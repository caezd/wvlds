import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import { useAnnouncementImageDrafts } from "../useAnnouncementImageDrafts";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const BASE = "https://x.supabase.co/storage/v1/object/public/worlds/";
const path = (n: string) => `user-u1/announcements/${n}.webp`;
const url = (n: string) => BASE + path(n);

let mock: SupabaseMock;
beforeEach(() => {
  mock = createSupabaseMock({});
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

function setup(initial: string | null = null) {
  return renderHook(({ current }) => useAnnouncementImageDrafts(current), {
    initialProps: { current: initial as string | null },
  });
}

describe("useAnnouncementImageDrafts", () => {
  it("efface l'image téléversée qu'on remplace", () => {
    const h = setup();
    act(() => h.result.current.track(url("a")));
    h.rerender({ current: url("a") });
    expect(mock.storageRemove).not.toHaveBeenCalled();
    act(() => h.result.current.track(url("b")));
    h.rerender({ current: url("b") });
    expect(mock.storageRemove).toHaveBeenCalledTimes(1);
    expect(mock.storageRemove).toHaveBeenCalledWith([path("a")]);
  });

  it("efface l'image téléversée qu'on retire", () => {
    const h = setup();
    act(() => h.result.current.track(url("a")));
    h.rerender({ current: url("a") });
    h.rerender({ current: null });
    expect(mock.storageRemove).toHaveBeenCalledWith([path("a")]);
  });

  it("ne touche jamais à une image qu'il n'a pas téléversée (annonce envoyée, reprise)", () => {
    const h = setup(url("ancienne"));
    act(() => h.result.current.track(url("b")));
    h.rerender({ current: url("b") });
    h.rerender({ current: null });
    expect(mock.storageRemove).toHaveBeenCalledTimes(1);
    expect(mock.storageRemove).toHaveBeenCalledWith([path("b")]);
    h.unmount();
    expect(mock.storageRemove).toHaveBeenCalledTimes(1);
  });

  it("garde l'image envoyée, même quand le formulaire se vide ensuite", () => {
    const h = setup();
    act(() => h.result.current.track(url("a")));
    h.rerender({ current: url("a") });
    act(() => h.result.current.keep(url("a")));
    h.rerender({ current: null });
    h.unmount();
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });

  it("brouillon quitté : l'image en attente part", () => {
    const h = setup();
    act(() => h.result.current.track(url("a")));
    h.rerender({ current: url("a") });
    h.unmount();
    expect(mock.storageRemove).toHaveBeenCalledWith([path("a")]);
  });

  it("discardAll : dialogue annulé", () => {
    const h = setup();
    act(() => h.result.current.track(url("a")));
    h.rerender({ current: url("a") });
    act(() => h.result.current.discardAll());
    expect(mock.storageRemove).toHaveBeenCalledWith([path("a")]);
    h.unmount();
    expect(mock.storageRemove).toHaveBeenCalledTimes(1);
  });

  it("n'efface rien hors du dossier des annonces de l'utilisateur", () => {
    const h = setup();
    act(() => h.result.current.track(BASE + "worlds-w1/map/carte.webp"));
    act(() => h.result.current.discardAll());
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });
});
