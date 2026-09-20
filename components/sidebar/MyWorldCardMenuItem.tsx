"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IdCard } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { MEMBER_CARD_COLUMNS, type WorldMemberCardFields } from "@/lib/worldMembers";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { WorldMemberCardDialog } from "@/components/worlds/members/WorldMemberCardDialog";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const WORLD_ROUTE = new RegExp(`^/w/(${UUID})(?:/|$)`);
const CHAT_ROUTE = new RegExp(`^/c/(${UUID})(?:/|$)`);

/**
 * Le monde où l'on se trouve, lu dans l'adresse : `/w/<id>` directement,
 * `/c/<id>` par le salon. Le menu du compte vit hors du fournisseur
 * d'appartenance (monté sous `/w/[id]`), l'adresse est ce qu'il a.
 */
export function useCurrentWorldId(): string | null {
  const pathname = usePathname() ?? "";
  const supabase = useMemo(() => createClient(), []);
  const worldMatch = pathname.match(WORLD_ROUTE);
  const chatMatch = pathname.match(CHAT_ROUTE);
  const chatId = chatMatch?.[1] ?? null;
  const [chatWorld, setChatWorld] = useState<{ chatId: string; worldId: string | null } | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from(TABLE.CHATROOMS).select("world_id").eq("id", chatId).maybeSingle();
      if (!cancelled) setChatWorld({ chatId, worldId: (data as { world_id: string | null } | null)?.world_id ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, chatId]);

  if (worldMatch) return worldMatch[1];
  if (chatId && chatWorld?.chatId === chatId) return chatWorld.worldId;
  return null;
}

/**
 * Ma carte dans le monde où l'on se trouve (présentation, disponibilités,
 * fuseau, anniversaire, statut), lue quand le monde change ; `null` hors d'un
 * monde ou si l'on n'en est pas membre.
 */
export function useMyWorldCard(userId: string): { worldId: string; card: WorldMemberCardFields; patch: (fields: WorldMemberCardFields) => void } | null {
  const supabase = useMemo(() => createClient(), []);
  const worldId = useCurrentWorldId();
  const [member, setMember] = useState<{ worldId: string; card: WorldMemberCardFields | null } | null>(null);

  useEffect(() => {
    if (!worldId) { setMember(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(TABLE.WORLD_MEMBERS)
        .select(MEMBER_CARD_COLUMNS)
        .eq("world_id", worldId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setMember({ worldId, card: (data as WorldMemberCardFields | null) ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, userId]);

  if (!worldId || member?.worldId !== worldId || !member.card) return null;
  const card = member.card;
  return { worldId, card, patch: (fields) => setMember({ worldId, card: { ...card, ...fields } }) };
}

/**
 * L'entrée « Ma carte dans ce monde » du menu du compte. Le dialogue, lui,
 * se rend hors du menu (`MyWorldCardDialog`) : le contenu d'un menu Radix
 * disparaît à sa fermeture, et emporterait le dialogue avec lui.
 */
export function MyWorldCardMenuItem({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations("worlds.members.card");
  return (
    <DropdownMenuItem onClick={afterMenuClose(onSelect)}>
      <IdCard className="mr-2 size-4" />
      {t("title")}
    </DropdownMenuItem>
  );
}

export function MyWorldCardDialog({
  userId,
  card,
  open,
  onOpenChange,
}: {
  userId: string;
  card: NonNullable<ReturnType<typeof useMyWorldCard>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return (
    <WorldMemberCardDialog
      key={card.worldId}
      worldId={card.worldId}
      userId={userId}
      mode="self"
      initial={card.card}
      open
      onOpenChange={onOpenChange}
      onSaved={card.patch}
    />
  );
}
