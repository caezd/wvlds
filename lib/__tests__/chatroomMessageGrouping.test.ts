import { describe, it, expect } from "vitest";
import { groupMessagesForRender, computeSmsRunFlags } from "@/lib/chatroomMessageGrouping";
import type { ChatMessageWithPersona } from "@/types/db";

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "user-1",
    content: "Salut",
    created_at: "2024-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("groupMessagesForRender", () => {
  it("retourne un tableau vide pour une liste vide", () => {
    expect(groupMessagesForRender([])).toEqual([]);
  });

  it("garde chaque message en 'single' quand aucun n'est SMS", () => {
    const messages = [
      makeMessage({ id: 1 }),
      makeMessage({ id: 2 }),
    ];
    const groups = groupMessagesForRender(messages);
    expect(groups).toEqual([
      { kind: "single", message: messages[0] },
      { kind: "single", message: messages[1] },
    ]);
  });

  it("fusionne les messages SMS consécutifs en un seul groupe", () => {
    const messages = [
      makeMessage({ id: 1, metadata: { sms: true } }),
      makeMessage({ id: 2, metadata: { sms: true } }),
      makeMessage({ id: 3, metadata: { sms: true } }),
    ];
    const groups = groupMessagesForRender(messages);
    expect(groups).toEqual([{ kind: "sms", messages }]);
  });

  it("coupe le groupe quand un message normal s'intercale", () => {
    const sms1 = makeMessage({ id: 1, metadata: { sms: true } });
    const normal = makeMessage({ id: 2 });
    const sms2 = makeMessage({ id: 3, metadata: { sms: true } });
    const groups = groupMessagesForRender([sms1, normal, sms2]);
    expect(groups).toEqual([
      { kind: "sms", messages: [sms1] },
      { kind: "single", message: normal },
      { kind: "sms", messages: [sms2] },
    ]);
  });

  it("ne regroupe pas un message dont le contenu est un bloc structuré, même avec metadata.sms", () => {
    const block = makeMessage({
      id: 1,
      content: '{"_type":"dice","total":4}',
      metadata: { sms: true },
    });
    const groups = groupMessagesForRender([block]);
    expect(groups).toEqual([{ kind: "single", message: block }]);
  });
});

describe("computeSmsRunFlags", () => {
  it("un message seul (aucun voisin du même auteur) : coins arrondis, avatar visible", () => {
    const solo = makeMessage({ id: 1, persona: { id: "p1", user_id: "u1", name: "Aria", avatar_url: null } });
    expect(computeSmsRunFlags([solo])).toEqual([
      { sharpTop: false, sharpBottom: false, showAvatar: true },
    ]);
  });

  it("resserre les coins de raccord pour une série du même persona et n'affiche l'avatar qu'au dernier", () => {
    const persona = { id: "p1", user_id: "u1", name: "Aria", avatar_url: null };
    const messages = [
      makeMessage({ id: 1, persona }),
      makeMessage({ id: 2, persona }),
      makeMessage({ id: 3, persona }),
    ];
    expect(computeSmsRunFlags(messages)).toEqual([
      { sharpTop: false, sharpBottom: true, showAvatar: false },
      { sharpTop: true, sharpBottom: true, showAvatar: false },
      { sharpTop: true, sharpBottom: false, showAvatar: true },
    ]);
  });

  it("coupe la sous-série quand l'auteur change et affiche l'avatar à chaque changement", () => {
    const personaA = { id: "pA", user_id: "u1", name: "Aria", avatar_url: null };
    const personaB = { id: "pB", user_id: "u2", name: "Boro", avatar_url: null };
    const messages = [
      makeMessage({ id: 1, persona: personaA }),
      makeMessage({ id: 2, persona: personaB }),
      makeMessage({ id: 3, persona: personaB }),
    ];
    expect(computeSmsRunFlags(messages)).toEqual([
      { sharpTop: false, sharpBottom: false, showAvatar: true },
      { sharpTop: false, sharpBottom: true, showAvatar: false },
      { sharpTop: true, sharpBottom: false, showAvatar: true },
    ]);
  });
});
