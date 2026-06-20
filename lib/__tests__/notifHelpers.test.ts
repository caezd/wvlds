import { describe, it, expect, vi, afterEach } from "vitest";
import { emojiFromContent, notifText, notifHref, compactTime } from "@/lib/notifHelpers";
import type { AppNotification } from "@/types/db";

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id: "n1",
        recipient_id: "u1",
        type: "mention",
        world_id: null,
        chat_id: null,
        message_id: null,
        actor_id: null,
        actor_name: null,
        content: null,
        metadata: null,
        read_at: null,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

// ── emojiFromContent ──────────────────────────────────────────────────────────

describe("emojiFromContent", () => {
    it("retourne '' pour null", () => {
        expect(emojiFromContent(null)).toBe("");
    });

    it("retourne '' pour une chaîne vide", () => {
        expect(emojiFromContent("")).toBe("");
    });

    it("passe les emojis unicode directs tels quels", () => {
        expect(emojiFromContent("❤️")).toBe("❤️");
    });

    it("passe le texte brut tel quel (non-hex)", () => {
        expect(emojiFromContent("like")).toBe("like");
    });

    it("convertit un codepoint hexadécimal simple en emoji", () => {
        // U+1F44D = 👍
        expect(emojiFromContent("1F44D")).toBe("👍");
    });

    it("convertit un codepoint composé (drapeau FR)", () => {
        // U+1F1EB U+1F1F7 = 🇫🇷
        expect(emojiFromContent("1F1EB-1F1F7")).toBe("🇫🇷");
    });

    it("convertit un emoji famille composé de plusieurs codepoints", () => {
        // ❤️ encodé = 2764-FE0F
        expect(emojiFromContent("2764-FE0F")).toBe("❤️");
    });
});

// ── notifText ─────────────────────────────────────────────────────────────────

describe("notifText", () => {
    it("mention avec acteur et chatroom", () => {
        expect(notifText(makeNotif({ type: "mention", actor_name: "alice", content: "général" })))
            .toBe("@alice vous a mentionné dans #général");
    });

    it("mention sans contenu (pas de chatroom)", () => {
        expect(notifText(makeNotif({ type: "mention", actor_name: "alice", content: null })))
            .toBe("@alice vous a mentionné");
    });

    it("mention sans acteur → Quelqu'un", () => {
        expect(notifText(makeNotif({ type: "mention", actor_name: null, content: "lobby" })))
            .toBe("Quelqu'un vous a mentionné dans #lobby");
    });

    it("réaction avec emoji codepoint", () => {
        expect(notifText(makeNotif({ type: "reaction", actor_name: "bob", content: "1F44D" })))
            .toBe("@bob a réagi 👍 à votre message");
    });

    it("réaction avec emoji unicode direct", () => {
        expect(notifText(makeNotif({ type: "reaction", actor_name: "bob", content: "🔥" })))
            .toBe("@bob a réagi 🔥 à votre message");
    });

    it("nouveau membre avec nom du monde", () => {
        expect(notifText(makeNotif({ type: "new_member", actor_name: "carol", content: "Hextech" })))
            .toBe("@carol a rejoint Hextech");
    });

    it("nouveau membre sans contenu → 'un monde'", () => {
        expect(notifText(makeNotif({ type: "new_member", actor_name: null, content: null })))
            .toBe("Quelqu'un a rejoint un monde");
    });

    it("nouvelle chatroom avec nom", () => {
        expect(notifText(makeNotif({ type: "new_chatroom", actor_name: "dave", content: "annonces" })))
            .toBe("@dave a créé annonces");
    });

    it("nouvelle chatroom sans contenu → 'une chatroom'", () => {
        expect(notifText(makeNotif({ type: "new_chatroom", actor_name: "dave", content: null })))
            .toBe("@dave a créé une chatroom");
    });

    it("invitation de monde", () => {
        expect(notifText(makeNotif({ type: "world_invite", actor_name: "eve" })))
            .toBe("@eve vous a invité à rejoindre un monde");
    });

    it("invitation de monde sans acteur", () => {
        expect(notifText(makeNotif({ type: "world_invite", actor_name: null })))
            .toBe("Quelqu'un vous a invité à rejoindre un monde");
    });

    it("chatroom_reply count=1 → texte avec acteur", () => {
        expect(notifText(makeNotif({ type: "chatroom_reply", actor_name: "alice", content: "général", metadata: { count: 1 } })))
            .toBe("@alice a répondu dans #général");
    });

    it("chatroom_reply count=1 sans chatroom", () => {
        expect(notifText(makeNotif({ type: "chatroom_reply", actor_name: "alice", content: null, metadata: { count: 1 } })))
            .toBe("@alice a répondu dans une chatroom");
    });

    it("chatroom_reply count=5 → texte agrégé", () => {
        expect(notifText(makeNotif({ type: "chatroom_reply", actor_name: "alice", content: "lobby", metadata: { count: 5 } })))
            .toBe("5 nouveaux messages dans #lobby");
    });

    it("chatroom_reply sans metadata → count implicite à 1", () => {
        expect(notifText(makeNotif({ type: "chatroom_reply", actor_name: "bob", content: "annonces", metadata: null })))
            .toBe("@bob a répondu dans #annonces");
    });
});

// ── notifHref ─────────────────────────────────────────────────────────────────

describe("notifHref", () => {
    it("retourne l'URL de la chatroom si chat_id est présent", () => {
        expect(notifHref(makeNotif({ chat_id: "c1", world_id: null }))).toBe("/c/c1");
    });

    it("retourne l'URL du monde si seulement world_id", () => {
        expect(notifHref(makeNotif({ chat_id: null, world_id: "w1" }))).toBe("/w/w1");
    });

    it("chat_id est prioritaire sur world_id", () => {
        expect(notifHref(makeNotif({ chat_id: "c1", world_id: "w1" }))).toBe("/c/c1");
    });

    it("retourne null si aucun id", () => {
        expect(notifHref(makeNotif({ chat_id: null, world_id: null }))).toBeNull();
    });
});

// ── compactTime ───────────────────────────────────────────────────────────────

describe("compactTime", () => {
    const BASE = new Date("2024-06-01T12:00:00Z");

    afterEach(() => vi.useRealTimers());

    function at(deltaMs: number): string {
        vi.useFakeTimers();
        vi.setSystemTime(BASE.getTime() + deltaMs);
        return BASE.toISOString();
    }

    it("< 1 min (30 sec)", () => {
        expect(compactTime(at(30_000))).toBe("< 1min");
    });

    it("minutes exactes (5 min)", () => {
        expect(compactTime(at(5 * 60_000))).toBe("5min");
    });

    it("59 minutes (reste en minutes)", () => {
        expect(compactTime(at(59 * 60_000))).toBe("59min");
    });

    it("1 heure pile", () => {
        expect(compactTime(at(60 * 60_000))).toBe("1h");
    });

    it("3 heures", () => {
        expect(compactTime(at(3 * 60 * 60_000))).toBe("3h");
    });

    it("23 heures (reste en heures)", () => {
        expect(compactTime(at(23 * 60 * 60_000))).toBe("23h");
    });

    it("1 jour", () => {
        expect(compactTime(at(24 * 60 * 60_000))).toBe("1j");
    });

    it("2 jours", () => {
        expect(compactTime(at(2 * 24 * 60 * 60_000))).toBe("2j");
    });
});
