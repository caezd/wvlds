import type { AppNotification } from "@/types/db";

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

export function notifText(n: AppNotification): string {
    const actor = n.actor_name ? `@${n.actor_name}` : "Quelqu'un";
    switch (n.type) {
        case "mention": return n.content ? `${actor} vous a mentionné dans #${n.content}` : `${actor} vous a mentionné`;
        case "reaction": return `${actor} a réagi ${emojiFromContent(n.content)} à votre message`;
        case "new_member": return `${actor} a rejoint ${n.content ?? "un monde"}`;
        case "new_chatroom": return `${actor} a créé ${n.content ?? "une chatroom"}`;
        case "world_invite": return `${actor} vous a invité à rejoindre un monde`;
        case "chatroom_reply": {
            const count = n.metadata?.count ?? 1;
            const place = n.content ? `dans #${n.content}` : "dans une chatroom";
            return count > 1 ? `${count} nouveaux messages ${place}` : `${actor} a répondu ${place}`;
        }
    }
}

export function notifHref(n: AppNotification): string | null {
    if (n.chat_id) return `/c/${n.chat_id}`;
    if (n.world_id) return `/w/${n.world_id}`;
    return null;
}

export function compactTime(iso: string): string {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return "< 1min";
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
}
