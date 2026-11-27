import { describe, it, expect } from "vitest";
import { parseChatBlock } from "@/lib/chat-blocks";

describe("parseChatBlock", () => {
  it("retourne null si le contenu ne commence pas par {", () => {
    expect(parseChatBlock("bonjour")).toBeNull();
    expect(parseChatBlock("")).toBeNull();
  });

  it("retourne null pour du JSON invalide", () => {
    expect(parseChatBlock("{pas du json")).toBeNull();
  });

  it("retourne null pour un JSON valide mais sans _type connu", () => {
    expect(parseChatBlock('{"_type":"inconnu"}')).toBeNull();
    expect(parseChatBlock('{"foo":"bar"}')).toBeNull();
  });

  it("parse un bloc dé valide", () => {
    const block = parseChatBlock('{"_type":"dice","formula":"1d6","results":[4],"modifier":0,"total":4}');
    expect(block).toMatchObject({ _type: "dice", total: 4 });
  });

  it.each(["banner", "reveal", "npc", "hp", "callout", "choice", "ellipse"])(
    "reconnaît le type de bloc %s",
    (type) => {
      expect(parseChatBlock(`{"_type":"${type}"}`)).toMatchObject({ _type: type });
    },
  );

  it("parse un bloc choix avec sa question et ses options", () => {
    const block = parseChatBlock(
      '{"_type":"choice","question":"Où ?","options":[{"id":"a","label":"Nord"},{"id":"b","label":"Sud"}]}',
    );
    expect(block).toMatchObject({
      _type: "choice",
      question: "Où ?",
      options: [{ id: "a", label: "Nord" }, { id: "b", label: "Sud" }],
    });
  });
});
