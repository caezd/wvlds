import { describe, it, expect } from "vitest";

import { extractMentionTargets, linkMentions, tokenizeMentions } from "@/lib/mentions";

const ROLES = [
  { id: "mj", name: "Maître du jeu" },
  { id: "maitre", name: "Maître" },
  { id: "joueur", name: "Joueur" },
];

describe("tokenizeMentions", () => {
  it("un pseudo simple", () => {
    expect(tokenizeMentions("bonjour @alice !", [])).toEqual([{ kind: "user", username: "alice", start: 8, end: 14 }]);
  });

  it("le plus long nom de rôle l'emporte, sans casse ni accents", () => {
    const [tok] = tokenizeMentions("@maitre du jeu, à vous", ROLES);
    expect(tok).toMatchObject({ kind: "role", roleId: "mj", name: "maitre du jeu", start: 0, end: 14 });
  });

  it("un rôle court quand le long ne suit pas", () => {
    expect(tokenizeMentions("@Maître, un avis ?", ROLES)[0]).toMatchObject({ kind: "role", roleId: "maitre" });
  });

  it("un nom de rôle collé à un mot ne compte pas ; un pseudo prend le relais", () => {
    expect(tokenizeMentions("@Joueurs", ROLES)[0]).toMatchObject({ kind: "user", username: "Joueurs" });
  });

  it("@tous et @ici dans les trois langues, @here comme @ici", () => {
    expect(tokenizeMentions("@tous @everyone @todos", [])).toEqual([
      { kind: "everyone", start: 0, end: 5 },
      { kind: "everyone", start: 6, end: 15 },
      { kind: "everyone", start: 16, end: 22 },
    ]);
    expect(tokenizeMentions("@ici @here @aquí", [])).toEqual([
      { kind: "here", start: 0, end: 4 },
      { kind: "here", start: 5, end: 10 },
      { kind: "here", start: 11, end: 16 },
    ]);
  });

  it("ignore un courriel et un @ au milieu d'un mot", () => {
    expect(tokenizeMentions("écrivez à alice@example.com ou x@y", [])).toEqual([]);
  });
});

describe("extractMentionTargets", () => {
  it("dédoublonne et sépare les cibles", () => {
    const t = extractMentionTargets("@alice @Joueur @alice @Maître du jeu @tous @ici", ROLES);
    expect(t).toEqual({ usernames: ["alice"], roleIds: ["joueur", "mj"], everyone: true, here: true });
  });

  it("rien à signaler sans @", () => {
    expect(extractMentionTargets("rien", ROLES)).toEqual({ usernames: [], roleIds: [], everyone: false, here: false });
  });
});

describe("linkMentions", () => {
  it("transforme chaque mention en lien `mention:`", () => {
    expect(linkMentions("Salut @alice et @Maître du jeu, @tous !", ROLES)).toBe(
      "Salut [@alice](mention:user:alice) et [@Maître du jeu](mention:role:mj), [@tous](mention:all) !",
    );
  });

  it("laisse intacts le code inline, les blocs fencés et les liens existants", () => {
    const src = ["`@alice` et [@bob](https://x.y) puis @carl", "```", "@dave", "```"].join("\n");
    expect(linkMentions(src, [])).toBe(
      ["`@alice` et [@bob](https://x.y) puis [@carl](mention:user:carl)", "```", "@dave", "```"].join("\n"),
    );
  });

  it("rend le texte tel quel sans @", () => {
    expect(linkMentions("aucune mention", ROLES)).toBe("aucune mention");
  });
});
