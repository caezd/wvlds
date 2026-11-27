import { describe, it, expect } from "vitest";
import { groupMessagesForRender, computeSmsRunFlags, aggregateContentWarnings, insertMessageById, computeThreadFlow } from "@/lib/chatroomMessageGrouping";
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

describe("aggregateContentWarnings", () => {
  it("retourne un tableau vide quand aucun message n'a d'avertissement", () => {
    const messages = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];
    expect(aggregateContentWarnings(messages)).toEqual([]);
  });

  it("regroupe les avertissements de tous les messages du bloc", () => {
    const messages = [
      makeMessage({ id: 1, metadata: { sms: true, content_warnings: ["violence"] } }),
      makeMessage({ id: 2, metadata: { sms: true, content_warnings: ["deuil"] } }),
    ];
    expect(aggregateContentWarnings(messages)).toEqual(["violence", "deuil"]);
  });

  it("déduplique les avertissements répétés (insensible à la casse), en gardant la première occurrence", () => {
    const messages = [
      makeMessage({ id: 1, metadata: { sms: true, content_warnings: ["violence"] } }),
      makeMessage({ id: 2, metadata: { sms: true, content_warnings: ["Violence", "deuil"] } }),
    ];
    expect(aggregateContentWarnings(messages)).toEqual(["violence", "deuil"]);
  });

  it("ignore les messages sans metadata ou sans avertissement", () => {
    const messages = [
      makeMessage({ id: 1, metadata: null }),
      makeMessage({ id: 2, metadata: { sms: true } }),
      makeMessage({ id: 3, metadata: { sms: true, content_warnings: ["deuil"] } }),
    ];
    expect(aggregateContentWarnings(messages)).toEqual(["deuil"]);
  });
});

describe("insertMessageById", () => {
  const ids = (list: { id: number }[]) => list.map((m) => m.id);

  it("ajoute en fin de liste un message plus récent", () => {
    expect(ids(insertMessageById([{ id: 1 }, { id: 2 }], { id: 3 }))).toEqual([1, 2, 3]);
  });

  it("insère à sa place un message plus ancien (rattrapage après un INSERT Realtime)", () => {
    expect(ids(insertMessageById([{ id: 1 }, { id: 4 }], { id: 2 }))).toEqual([1, 2, 4]);
    expect(ids(insertMessageById([{ id: 5 }], { id: 3 }))).toEqual([3, 5]);
  });

  it("rend la liste inchangée (même référence) pour un doublon", () => {
    const list = [{ id: 1 }, { id: 2 }];
    expect(insertMessageById(list, { id: 1 })).toBe(list);
    expect(insertMessageById(list, { id: 2 })).toBe(list);
  });

  it("accepte une liste vide", () => {
    expect(ids(insertMessageById([], { id: 7 }))).toEqual([7]);
  });
});

describe("insertMessageById — messages insérés (migration 216)", () => {
  const m = (id: number, created_at: string) => ({ id, created_at });

  it("place un message inséré avant sa cible, malgré son id plus récent", () => {
    const fil = [m(1, "2026-11-17T10:00:00Z"), m(2, "2026-11-17T10:05:00Z"), m(3, "2026-11-17T10:10:00Z")];
    // Inséré avant le message 2 : daté deux secondes avant lui, id le plus récent.
    const insere = m(9, "2026-11-17T10:04:58Z");
    expect(insertMessageById(fil, insere).map((x) => x.id)).toEqual([1, 9, 2, 3]);
  });

  it("ajoute en fin de fil un message plus récent", () => {
    const fil = [m(1, "2026-11-17T10:00:00Z"), m(9, "2026-11-17T10:04:58Z"), m(2, "2026-11-17T10:05:00Z")];
    expect(insertMessageById(fil, m(10, "2026-11-17T10:20:00Z")).map((x) => x.id)).toEqual([1, 9, 2, 10]);
  });

  it("à date égale, départage par id ; sans date, par id comme avant", () => {
    const fil = [m(1, "2026-11-17T10:00:00Z"), m(3, "2026-11-17T10:00:00Z")];
    expect(insertMessageById(fil, m(2, "2026-11-17T10:00:00Z")).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(insertMessageById([{ id: 1 }, { id: 3 }], { id: 2 }).map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("ignore un doublon, même placé ailleurs", () => {
    const fil = [m(1, "2026-11-17T10:00:00Z"), m(9, "2026-11-17T10:04:58Z")];
    expect(insertMessageById(fil, m(9, "2026-11-17T10:04:58Z"))).toBe(fil);
  });
});

describe("computeThreadFlow — messages consécutifs d'un même persona", () => {
  const DE = '{"_type":"dice","formula":"1d20","results":[12],"modifier":0,"total":12}';
  const aria = { id: "p-aria", name: "Aria" } as ChatMessageWithPersona["persona"];
  const brom = { id: "p-brom", name: "Brom" } as ChatMessageWithPersona["persona"];
  const flow = (messages: ChatMessageWithPersona[]) => computeThreadFlow(groupMessagesForRender(messages));

  it("la suite d'un même persona n'a pas d'en-tête ; le message d'avant se lie à elle", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: aria }),
      makeMessage({ id: 3, persona: aria }),
    ]);
    expect(f.get(1)).toEqual({ continued: false, joinsNext: true });
    expect(f.get(2)).toEqual({ continued: true, joinsNext: true });
    expect(f.get(3)).toEqual({ continued: true, joinsNext: false });
  });

  it("un autre persona, ou le même persona joué par un autre joueur, recommence une série", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: brom }),
      makeMessage({ id: 3, persona: brom, author_id: "user-2" }),
    ]);
    expect(f.get(2)?.continued).toBe(false);
    expect(f.get(3)?.continued).toBe(false);
    expect(f.get(1)?.joinsNext).toBe(false);
  });

  it("le jet de dé qui suit la réponse s'y rattache, et la réponse suivante du même persona aussi", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: aria, content: DE }),
      makeMessage({ id: 3, persona: aria }),
    ]);
    expect(f.get(1)).toEqual({ continued: false, joinsNext: true });
    expect(f.get(2)).toEqual({ continued: true, joinsNext: true });
    expect(f.get(3)).toEqual({ continued: true, joinsNext: false });
  });

  it("une bannière du même persona se rattache comme un jet de dé, et la réponse suivante aussi", () => {
    const BANNIERE = '{"_type":"banner","url":"https://exemple.test/b.png"}';
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: aria, content: BANNIERE }),
      makeMessage({ id: 3, persona: aria }),
    ]);
    expect(f.get(1)).toEqual({ continued: false, joinsNext: true });
    expect(f.get(2)).toEqual({ continued: true, joinsNext: true });
    expect(f.get(3)).toEqual({ continued: true, joinsNext: false });
  });

  it("tous les blocs du même persona se rattachent à la réponse, sans séparateur", () => {
    // Chaque type de bloc connu (le dé et la bannière sont vus plus haut).
    const blocs = ["reveal", "npc", "hp", "callout", "anchor", "choice", "transfer", "ellipse"]
      .map((type) => JSON.stringify({ _type: type }));
    for (const bloc of blocs) {
      const f = flow([
        makeMessage({ id: 1, persona: aria }),
        makeMessage({ id: 2, persona: aria, content: bloc }),
        makeMessage({ id: 3, persona: aria }),
      ]);
      expect(f.get(1), bloc).toEqual({ continued: false, joinsNext: true });
      expect(f.get(2), bloc).toEqual({ continued: true, joinsNext: true });
      expect(f.get(3), bloc).toEqual({ continued: true, joinsNext: false });
    }
  });

  it("un bloc posté avant la réponse s'y lie aussi, mais la réponse garde son en-tête", () => {
    const f = flow([
      makeMessage({ id: 1, persona: brom }),
      makeMessage({ id: 2, persona: aria, content: DE }),
      makeMessage({ id: 3, persona: aria }),
      makeMessage({ id: 4, persona: aria }),
    ]);
    expect(f.get(1)?.joinsNext).toBe(false);
    expect(f.get(2)).toEqual({ continued: false, joinsNext: true });
    // Rien n'a encore dit qui parle : l'en-tête reste.
    expect(f.get(3)).toEqual({ continued: false, joinsNext: true });
    expect(f.get(4)).toEqual({ continued: true, joinsNext: false });
  });

  it("le bloc d'un autre persona ne se lie pas", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: brom, content: DE }),
    ]);
    expect(f.get(1)?.joinsNext).toBe(false);
    expect(f.get(2)?.continued).toBe(false);
  });

  it("une note privée ou un SMS coupe la série", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: aria, visible_to: ["user-2"] }),
      makeMessage({ id: 3, persona: aria }),
      makeMessage({ id: 4, persona: aria, metadata: { sms: true } }),
      makeMessage({ id: 5, persona: aria }),
    ]);
    for (const id of [2, 3, 5]) expect(f.get(id)?.continued, `message ${id}`).toBe(false);
    for (const id of [1, 3]) expect(f.get(id)?.joinsNext, `message ${id}`).toBe(false);
  });

  it("une réponse à l'en-tête complet n'est pas une suite : elle ouvre la sienne", () => {
    const f = flow([
      makeMessage({ id: 1, persona: aria }),
      makeMessage({ id: 2, persona: aria, metadata: { header: "full" } }),
      makeMessage({ id: 3, persona: aria }),
    ]);
    expect(f.get(1)?.joinsNext).toBe(false);
    expect(f.get(2)).toEqual({ continued: false, joinsNext: true });
    expect(f.get(3)?.continued).toBe(true);
  });

  it("sans persona, les messages d'un même joueur se suivent aussi", () => {
    const f = flow([makeMessage({ id: 1 }), makeMessage({ id: 2 })]);
    expect(f.get(2)?.continued).toBe(true);
  });
});
