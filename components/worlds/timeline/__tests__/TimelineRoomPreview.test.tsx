import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SupabaseClient } from "@supabase/supabase-js";

import { encryptMessage, generateRoomKey } from "@/lib/crypto";

const keys = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/chatroomKeys", () => ({
  getChatroomKeys: async (_s: unknown, ids: string[]) => new Map(ids.filter((id) => keys.has(id)).map((id) => [id, keys.get(id)!])),
}));

import {
  RoomPreviewProvider,
  TimelineRoomPreview,
  __clearRoomPreviewCache,
  loadRoomPreview,
  messageExcerpt,
} from "@/components/worlds/timeline/TimelineRoomPreview";

const JOUR = 86_400_000;

/**
 * Un faux client : le dernier message (`limit`) ou le compte (`head`), pour
 * la table des messages. `calls` compte les requêtes.
 */
function fauxClient(last: { content: string | null; created_at: string } | null, count: number, error: unknown = null) {
  const calls = { n: 0 };
  const client = {
    from: () => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        calls.n++;
        const result = opts?.head ? { count, error } : { data: last ? [last] : [], error };
        const b: Record<string, unknown> = {};
        for (const m of ["eq", "order", "limit"]) b[m] = () => b;
        b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
        return b;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  __clearRoomPreviewCache();
  keys.clear();
});

describe("messageExcerpt", () => {
  it("une ligne sans balises Markdown, coupée d'une ellipse", () => {
    expect(messageExcerpt("**Tu savais**,\n\n> depuis le _début_. [Lien](https://x.y)")).toBe("Tu savais, depuis le début. Lien");
    expect(messageExcerpt("a".repeat(200), 10)).toBe("aaaaaaaaa…");
    expect(messageExcerpt("```\ncode\n```")).toBeNull();
  });
});

describe("loadRoomPreview", () => {
  it("déchiffre le dernier message avec la clé du salon, compte les messages", async () => {
    const cle = await generateRoomKey();
    keys.set("r1", cle);
    const { client } = fauxClient({ content: await encryptMessage("— Tu savais, depuis le début.", cle), created_at: "2026-01-01T00:00:00Z" }, 19);
    expect(await loadRoomPreview(client, "r1")).toEqual({
      count: 19,
      lastAt: "2026-01-01T00:00:00Z",
      excerpt: "— Tu savais, depuis le début.",
    });
  });

  it("sans clé, un message chiffré ne se montre pas ; sans message, pas d'extrait", async () => {
    const cle = await generateRoomKey();
    const chiffre = fauxClient({ content: await encryptMessage("secret", cle), created_at: "2026-01-01T00:00:00Z" }, 1).client;
    expect((await loadRoomPreview(chiffre, "r1")).excerpt).toBeNull();
    const vide = fauxClient(null, 0).client;
    expect(await loadRoomPreview(vide, "r2")).toEqual({ count: 0, lastAt: null, excerpt: null });
  });

  it("gardé une minute ; une requête en échec n'est pas gardée", async () => {
    const { client, calls } = fauxClient({ content: "Bonjour", created_at: "2026-01-01T00:00:00Z" }, 1);
    await loadRoomPreview(client, "r1", 1_000);
    await loadRoomPreview(client, "r1", 30_000);
    expect(calls.n).toBe(2);
    await loadRoomPreview(client, "r1", 70_000);
    expect(calls.n).toBe(4);

    const panne = fauxClient(null, 0, { message: "RLS" }).client;
    await expect(loadRoomPreview(panne, "r3")).rejects.toEqual({ message: "RLS" });
    await Promise.resolve();
    const { client: repare } = fauxClient({ content: "Revenu", created_at: "2026-01-01T00:00:00Z" }, 1);
    expect((await loadRoomPreview(repare, "r3")).excerpt).toBe("Revenu");
  });
});

describe("TimelineRoomPreview", () => {
  const PERSONAS = [
    { id: "p1", name: "Tess", color: "#3b82f6" },
    { id: "p2", name: "Aldric", color: "#eab308" },
    { id: "p3", name: "Ysolde", color: null },
  ];

  it("au survol, après un court délai : participants, extrait, messages, ancienneté, statut", async () => {
    const user = userEvent.setup();
    const { client } = fauxClient({ content: "— Tu savais. Ne me mens pas.", created_at: new Date(Date.now() - 47 * JOUR).toISOString() }, 19);
    render(
      <RoomPreviewProvider value={{ supabase: client, participantsOf: () => PERSONAS }}>
        <TimelineRoomPreview roomId="r1" status="dormant">
          <button type="button">Disparition près des docks</button>
        </TimelineRoomPreview>
      </RoomPreviewProvider>,
    );
    await user.hover(screen.getByRole("button", { name: "Disparition près des docks" }));
    // Pas tout de suite : un survol de passage n'ouvre rien.
    expect(screen.queryByTestId("timeline-room-preview")).toBeNull();

    const carte = await screen.findByTestId("timeline-room-preview", {}, { timeout: 2000 });
    const gens = screen.getByTestId("timeline-room-preview-people");
    expect(gens).toHaveTextContent("TAYTess, Aldric, Ysolde");
    expect(await screen.findByText("« — Tu savais. Ne me mens pas. »")).toBeInTheDocument();
    expect(carte).toHaveTextContent("19 messages");
    expect(carte).toHaveTextContent("dernier message il y a 47 jours");
    expect(carte).toHaveTextContent("En sommeil");
  });

  it("hors de la frise (sans contexte), le titre reste seul", () => {
    render(
      <TimelineRoomPreview roomId="r1" status="active">
        <button type="button">Seul</button>
      </TimelineRoomPreview>,
    );
    expect(screen.getByRole("button", { name: "Seul" })).not.toHaveAttribute("data-state");
  });
});
