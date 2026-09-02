import { describe, it, expect } from "vitest";

import { firstImage } from "@/lib/imageUtils";

/** Un `DataTransfer` de façade : jsdom n'en fabrique pas de complet. */
function transfert({
  items = [],
  files = [],
}: {
  items?: { kind: string; type: string; fichier?: File }[];
  files?: File[];
}): DataTransfer {
  return {
    items: items.map(i => ({
      kind: i.kind,
      type: i.type,
      getAsFile: () => i.fichier ?? null,
    })),
    files,
  } as unknown as DataTransfer;
}

const IMAGE = new File(["x"], "capture.png", { type: "image/png" });
const TEXTE = new File(["x"], "notes.txt", { type: "text/plain" });

describe("firstImage", () => {
  it("trouve une capture collée, qui ne passe que par `items`", () => {
    const source = transfert({ items: [{ kind: "file", type: "image/png", fichier: IMAGE }] });
    expect(firstImage(source)).toBe(IMAGE);
  });

  it("trouve un fichier déposé, qui ne passe que par `files`", () => {
    expect(firstImage(transfert({ files: [IMAGE] }))).toBe(IMAGE);
  });

  it("ignore le texte collé — le navigateur le colle mieux que nous", () => {
    const source = transfert({
      items: [{ kind: "string", type: "text/plain" }],
      files: [TEXTE],
    });
    expect(firstImage(source)).toBeNull();
  });

  it("ne se laisse pas prendre par un `items` d'image sans fichier derrière", () => {
    // Safari annonce parfois le type sans donner le fichier : on retombe alors
    // sur `files`, et sur rien du tout s'il est vide.
    const source = transfert({ items: [{ kind: "file", type: "image/png" }] });
    expect(firstImage(source)).toBeNull();
  });

  it("supporte l'absence de source", () => {
    expect(firstImage(null)).toBeNull();
  });
});
