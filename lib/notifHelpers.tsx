import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import type { AppNotification } from "@/types/db";

export type NotifT = ReturnType<typeof useTranslations<"notifications">>;

const UNIFIED_RE = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;

export function emojiFromContent(raw: string | null): string {
    if (!raw) return "";
    if (!UNIFIED_RE.test(raw)) return raw;
    try {
        return raw.split("-").map(u => String.fromCodePoint(parseInt(u, 16))).join("");
    } catch {
        return raw;
    }
}

const b = (chunks: ReactNode) => <span className="font-semibold">{chunks}</span>;

export function notifText(n: AppNotification, t: NotifT): ReactNode {
    const actor = n.actor_name ?? t("text.someone");
    const r = { b };

    switch (n.type) {
        case "mention":
            return n.content
                ? t.rich("text.mention", { actor, chatroom: n.content, ...r })
                : t.rich("text.mentionSimple", { actor, ...r });
        case "reaction":
            return t.rich("text.reaction", { actor, emoji: emojiFromContent(n.content), ...r });
        case "new_member":
            return n.content
                ? t.rich("text.newMember", { actor, world: n.content, ...r })
                : t.rich("text.newMemberNoWorld", { actor, ...r });
        case "new_chatroom":
        case "persona_new_chatroom":
            return n.content
                ? t.rich("text.newChatroom", { actor, chatroom: n.content, ...r })
                : t.rich("text.newChatroomNoName", { actor, ...r });
        case "world_invite":
            return t.rich("text.worldInvite", { actor, ...r });
        case "chatroom_reply": {
            const count = n.metadata?.count ?? 1;
            const persona = n.metadata?.persona_name;
            return count > 1
                ? n.content
                    ? t.rich("text.chatroomReplyMany", { count, chatroom: n.content, ...r })
                    : t.rich("text.chatroomReplyManyNoContent", { count, ...r })
                : persona && n.content
                    ? t.rich("text.chatroomReplyWithPersona", { persona, actor, chatroom: n.content, ...r })
                    : n.content
                        ? t.rich("text.chatroomReplySingle", { actor, chatroom: n.content, ...r })
                        : t.rich("text.chatroomReplySingleNoContent", { actor, ...r });
        }
        case "persona_reply": {
            const count = n.metadata?.count ?? 1;
            return count > 1
                ? n.content
                    ? t.rich("text.personaReplyMany", { count, actor, chatroom: n.content, ...r })
                    : t.rich("text.personaReplyManyNoContent", { count, actor, ...r })
                : n.content
                    ? t.rich("text.chatroomReplySingle", { actor, chatroom: n.content, ...r })
                    : t.rich("text.chatroomReplySingleNoContent", { actor, ...r });
        }
    }
}

export function notifHref(n: AppNotification): string | null {
    if (n.chat_id) return `/c/${n.chat_id}`;
    if (n.world_id) return `/w/${n.world_id}`;
    return null;
}

export function compactTime(iso: string, dayAbbr = "j"): string {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return "< 1min";
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}${dayAbbr}`;
}
