import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MentionAutocomplete, buildMentionCandidates, type MentionCandidate } from "@/components/chatrooms/composer/MentionAutocomplete";
import type { WorldRoleRow } from "@/lib/worldPermissions";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

function role(over: Partial<WorldRoleRow> & { id: string; name: string }): WorldRoleRow {
  return { world_id: "w1", color: "#3b82f6", lucide_icon: null, position: 0, permissions: [], is_default: false, mentionable: false, hoist: false, ...over };
}
const MEMBERS = [
  { user_id: "u1", username: "alice", avatar_url: null },
  { user_id: "u2", username: "alban", avatar_url: null },
  { user_id: "u3", username: "bob", avatar_url: null },
  { user_id: "me", username: "moi", avatar_url: null },
];
const ROLES = [role({ id: "mj", name: "Maître du jeu", mentionable: true }), role({ id: "admin", name: "Administrateur" })];
const TOKENS = { everyone: "tous", here: "ici" };

describe("buildMentionCandidates", () => {
  it("sans saisie : membres (sauf soi), rôles autorisés, puis @tous/@ici", () => {
    const list = buildMentionCandidates({ query: "", members: MEMBERS, roles: ROLES, canMentionRoles: false, canMentionEveryone: true, tokens: TOKENS, selfId: "me" });
    expect(list.map((c) => c.label)).toEqual(["@alban", "@alice", "@bob", "@Maître du jeu", "@tous", "@ici"]);
  });

  it("filtre sans casse ni accents, un préfixe avant une occurrence", () => {
    const list = buildMentionCandidates({ query: "al", members: MEMBERS, roles: ROLES, canMentionRoles: false, canMentionEveryone: true, tokens: TOKENS });
    expect(list.map((c) => c.label)).toEqual(["@alban", "@alice"]);
    const mj = buildMentionCandidates({ query: "maitre", members: [], roles: ROLES, canMentionRoles: false, canMentionEveryone: false, tokens: TOKENS });
    expect(mj.map((c) => c.label)).toEqual(["@Maître du jeu"]);
  });

  it("un rôle non mentionnable n'apparaît qu'avec `mentions.roles` ; @tous qu'avec `mentions.everyone`", () => {
    const without = buildMentionCandidates({ query: "", members: [], roles: ROLES, canMentionRoles: false, canMentionEveryone: false, tokens: TOKENS });
    expect(without.map((c) => c.label)).toEqual(["@Maître du jeu"]);
    const withAll = buildMentionCandidates({ query: "", members: [], roles: ROLES, canMentionRoles: true, canMentionEveryone: true, tokens: TOKENS });
    expect(withAll.map((c) => c.label)).toEqual(["@Administrateur", "@Maître du jeu", "@tous", "@ici"]);
  });

  it("le texte inséré finit par une espace, pour reprendre la frappe", () => {
    const [c] = buildMentionCandidates({ query: "bob", members: MEMBERS, roles: [], canMentionRoles: false, canMentionEveryone: false, tokens: TOKENS });
    expect(c.insert).toBe("@bob ");
  });

  it("ne propose jamais plus de huit entrées", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ user_id: `u${i}`, username: `user${i}`, avatar_url: null }));
    expect(buildMentionCandidates({ query: "", members: many, roles: [], canMentionRoles: false, canMentionEveryone: false, tokens: TOKENS })).toHaveLength(8);
  });
});

describe("MentionAutocomplete", () => {
  const items: MentionCandidate[] = [
    { kind: "user", id: "u1", label: "@alice", insert: "@alice ", avatarUrl: null },
    { kind: "role", id: "mj", label: "@Maître du jeu", insert: "@Maître du jeu ", color: "#3b82f6" },
    { kind: "everyone", id: "everyone", label: "@tous", insert: "@tous " },
  ];

  it("liste les propositions, marque l'active, et choisit au mousedown", () => {
    const onPick = vi.fn();
    render(<MentionAutocomplete items={items} activeIndex={1} rect={null} onPick={onPick} onHover={() => {}} />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveTextContent("Rôle");
    expect(options[2]).toHaveTextContent("Tout le monde");

    fireEvent.mouseDown(options[0]);
    expect(onPick).toHaveBeenCalledWith(items[0]);
  });

  it("ne rend rien sans proposition", () => {
    render(<MentionAutocomplete items={[]} activeIndex={0} rect={null} onPick={() => {}} onHover={() => {}} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
