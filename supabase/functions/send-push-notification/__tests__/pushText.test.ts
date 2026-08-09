import { describe, expect, it } from "vitest";
import { buildPushText, pushHref, resolvePushImage, type PushNotifPayload } from "../pushText";

const ALL_TYPES: PushNotifPayload["type"][] = [
  "mention", "reaction", "new_member", "new_chatroom", "world_invite",
  "chatroom_reply", "persona_new_chatroom", "persona_reply", "marital_request",
];

const base: PushNotifPayload = {
  type: "mention", world_id: null, chat_id: "c1", actor_id: "u1",
  actor_name: "Alice", content: "Salon Test", metadata: null,
};

describe("buildPushText", () => {
  it.each(ALL_TYPES)("renvoie un titre/corps non vides pour %s", (type) => {
    const { title, body } = buildPushText({ ...base, type }, "fr");
    expect(title).toBeTruthy();
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/<b>|<\/b>/);
  });

  it("utilise le compteur agrégé pour chatroom_reply", () => {
    const { body } = buildPushText({ ...base, type: "chatroom_reply", metadata: { count: 3 } }, "fr");
    expect(body).toContain("3");
  });

  it("utilise le compteur agrégé pour persona_reply", () => {
    const { body } = buildPushText({ ...base, type: "persona_reply", metadata: { count: 4 } }, "fr");
    expect(body).toContain("4");
  });

  it("mentionne le persona quand chatroom_reply a un persona_name en metadata", () => {
    const { body } = buildPushText(
      { ...base, type: "chatroom_reply", metadata: { count: 1, persona_name: "Elric" } },
      "fr",
    );
    expect(body).toContain("Elric");
  });

  it("retombe sur « Quelqu'un » quand actor_name est absent (fr)", () => {
    const { body } = buildPushText({ ...base, actor_name: null }, "fr");
    expect(body).toContain("Quelqu'un");
  });

  it("retombe sur « Someone » quand actor_name est absent (en)", () => {
    const { body } = buildPushText({ ...base, actor_name: null }, "en");
    expect(body).toContain("Someone");
  });

  it("retombe sur « Alguien » quand actor_name est absent (es)", () => {
    const { body } = buildPushText({ ...base, actor_name: null }, "es");
    expect(body).toContain("Alguien");
  });

  it("distingue married vs relationship pour marital_request", () => {
    const married = buildPushText({ ...base, type: "marital_request", content: "Bob", metadata: { requested_status: "married" } }, "fr");
    const relationship = buildPushText({ ...base, type: "marital_request", content: "Bob", metadata: { requested_status: "relationship" } }, "fr");
    expect(married.body).not.toBe(relationship.body);
  });
});

describe("pushHref", () => {
  it("priorise chat_id sur world_id", () => {
    expect(pushHref({ chat_id: "c1", world_id: "w1" })).toBe("/c/c1");
  });
  it("retombe sur world_id si pas de chat_id", () => {
    expect(pushHref({ chat_id: null, world_id: "w1" })).toBe("/w/w1");
  });
  it("renvoie null si ni l'un ni l'autre", () => {
    expect(pushHref({ chat_id: null, world_id: null })).toBeNull();
  });
});

describe("resolvePushImage", () => {
  it("utilise l'avatar humain pour un type non-persona", () => {
    expect(resolvePushImage({ ...base, type: "mention" }, "https://ex.test/human.png")).toBe("https://ex.test/human.png");
  });

  it("renvoie null pour un type non-persona sans avatar", () => {
    expect(resolvePushImage({ ...base, type: "reaction" }, null)).toBeNull();
  });

  it("utilise metadata.icon_url pour un type persona explicite", () => {
    const img = resolvePushImage(
      { ...base, type: "persona_reply", metadata: { icon_url: "https://ex.test/persona.png" } },
      "https://ex.test/human.png", // avatar humain présent mais ignoré
    );
    expect(img).toBe("https://ex.test/persona.png");
  });

  it("renvoie null pour un type persona sans icon_url en metadata", () => {
    expect(resolvePushImage({ ...base, type: "marital_request", metadata: null }, "https://ex.test/human.png")).toBeNull();
  });

  it("détecte un chatroom_reply enrichi d'un persona via metadata.persona_name", () => {
    const img = resolvePushImage(
      { ...base, type: "chatroom_reply", metadata: { count: 1, persona_name: "Elric", icon_url: "https://ex.test/elric.png" } },
      "https://ex.test/human.png",
    );
    expect(img).toBe("https://ex.test/elric.png");
  });

  it("utilise l'avatar humain pour un chatroom_reply sans persona", () => {
    const img = resolvePushImage(
      { ...base, type: "chatroom_reply", metadata: { count: 1 } },
      "https://ex.test/human.png",
    );
    expect(img).toBe("https://ex.test/human.png");
  });
});
