"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Persona } from "@/types/db";
import type { PersonaSectionWithFields } from "@/types/personas";
import { Coins, Flame, Zap } from "lucide-react";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";

// -- Level helpers --------------------------------------------
// level = floor(sqrt(xp / 50)) + 1
// xp needed for level N = (N-1)² × 50
function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const xpForCurrent = (level - 1) * (level - 1) * 50;
  const xpForNext = level * level * 50;
  const progress = xpForNext > xpForCurrent
    ? ((xp - xpForCurrent) / (xpForNext - xpForCurrent)) * 100
    : 100;
  return { level, xpForCurrent, xpForNext, progress: Math.min(progress, 100) };
}

type Balance = {
  xp: number;
  coins: number;
  streak_current: number;
};

// -- Read-only field renderer ---------------------------------
function FieldView({ type, data }: { type: string; data: any }) {
  if (type === "title") {
    return (
      <h3 className="text-base font-semibold text-foreground">
        {data?.text || ""}
      </h3>
    );
  }
  if (type === "text") {
    return data?.text ? (
      <MarkdownRenderer content={data.text} className="text-sm prose-sm" />
    ) : null;
  }
  return null;
}

// -- Main component -------------------------------------------
type Props = {
  persona: Persona | null;
  selfId: string | null;
  onClose: () => void;
  onUsePersona?: (p: Persona) => void;
};

export function PersonaProfileSheet({ persona, selfId, onClose, onUsePersona }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const { onlineUsers } = useGlobalPresence();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [sections, setSections] = useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);

  useEffect(() => {
    if (!persona) {
      setBalance(null);
      setSections([]);
      setActiveTab(null);
      setOwnerPresence(null);
      setBannerUrl(null);
      setFrameUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      // bannière + cadre du persona
      const { data: personaRow } = await supabase
        .from("personas")
        .select("banner_url, frame:avatar_frame_id(asset_url)")
        .eq("id", persona!.id)
        .maybeSingle();

      // gamification balance
      const { data: bal } = await supabase
        .from("gamification_balances")
        .select("xp, coins, streak_current")
        .eq("user_id", persona!.user_id)
        .maybeSingle();

      // présence persistée du propriétaire (pour "vu il y a X")
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("last_seen_at, appear_offline")
        .eq("id", persona!.user_id)
        .maybeSingle();

      // sections + fields
      const { data: secs } = await supabase
        .from("persona_sections")
        .select("id, persona_id, name, position")
        .eq("persona_id", persona!.id)
        .order("position", { ascending: true });

      let sectionsWithFields: PersonaSectionWithFields[] = [];
      if (secs?.length) {
        const sectionIds = secs.map((s) => s.id);
        const { data: fields } = await supabase
          .from("persona_section_fields")
          .select("id, section_id, type, position, data")
          .in("section_id", sectionIds)
          .order("position", { ascending: true });

        sectionsWithFields = secs.map((s) => ({
          ...s,
          fields: (fields ?? []).filter((f) => f.section_id === s.id),
        }));
      }

      if (cancelled) return;
      const row = personaRow as unknown as { banner_url?: string | null; frame?: { asset_url?: string | null } | null } | null;
      setBannerUrl(row?.banner_url ?? null);
      setFrameUrl(row?.frame?.asset_url ?? null);
      setBalance(bal ?? null);
      setOwnerPresence(
        ownerProfile
          ? {
              last_seen_at:
                (ownerProfile as unknown as { last_seen_at?: string | null })
                  .last_seen_at ?? null,
              appear_offline: !!(
                ownerProfile as unknown as { appear_offline?: boolean | null }
              ).appear_offline,
            }
          : null,
      );
      setSections(sectionsWithFields);
      setActiveTab(sectionsWithFields[0]?.id ?? null);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [persona?.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const xpInfo = balance ? levelFromXp(balance.xp) : null;

  const isOnline = !!persona && !!onlineUsers[persona.user_id];
  const presenceLine =
    !persona
      ? null
      : !ownerPresence && !isOnline
        ? null // données pas encore chargées
        : isOnline
          ? "En ligne"
          : ownerPresence?.appear_offline
            ? "Hors ligne"
            : ownerPresence?.last_seen_at
              ? `Vu ${formatLastSeen(ownerPresence.last_seen_at)}`
              : "Hors ligne";

  function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }

  return (
    <Sheet open={!!persona} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[440px] flex flex-col gap-0 p-0 overflow-y-auto"
      >
        {persona && (
          <>
            {/* -- Bannière -- */}
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="" className="h-28 w-full object-cover shrink-0" draggable={false} />
            ) : (
              <div className="h-28 w-full shrink-0 bg-gradient-to-r from-muted/60 to-muted" />
            )}

            {/* -- Header stats -- */}
            <div className="px-5 pt-5 pb-4 border-b border-border space-y-3">
              {xpInfo && balance ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">
                      Niveau {xpInfo.level}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {balance.xp} / {xpInfo.xpForNext} XP
                    </span>
                  </div>
                  {/* XP bar */}
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${xpInfo.progress}%` }}
                    />
                  </div>
                  {/* Coins + streak */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Coins className="h-4 w-4" />
                      {balance.coins.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-orange-400">
                      <Flame className="h-4 w-4" />
                      {balance.streak_current} j.
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                      <Zap className="h-4 w-4" />
                      {balance.xp} XP
                    </span>
                  </div>
                </>
              ) : loading ? (
                <div className="h-8 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-xs text-muted-foreground">Aucune donnée de progression.</p>
              )}
            </div>

            {/* -- Avatar + nom -- */}
            <div className="flex flex-col items-center gap-2 py-6 border-b border-border">
              <AvatarWithFrame
                src={persona.avatar_url}
                alt={persona.name}
                fallback={initials(persona.name)}
                online={isOnline}
                size={80}
                frameUrl={frameUrl}
              />
              <div className="text-center">
                <div className="text-lg font-semibold">{persona.name}</div>
                {presenceLine && (
                  <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isOnline ? "bg-[#58F4A8]" : "bg-muted-foreground/40"
                      }`}
                    />
                    {presenceLine}
                  </div>
                )}
                {persona.user_id === selfId && (
                  <div className="text-xs text-muted-foreground">Votre persona</div>
                )}
              </div>
              {onUsePersona && (
                <button
                  className="mt-1 rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  onClick={() => { onUsePersona(persona); onClose(); }}
                >
                  Utiliser ce persona
                </button>
              )}
            </div>

            {/* -- Sections -- */}
            {sections.length > 0 && (
              <div className="flex-1">
                <Tabs
                  value={activeTab ?? sections[0].id}
                  onValueChange={setActiveTab}
                >
                  <div className="border-b border-border">
                    <TabsList className="rounded-none bg-transparent h-auto px-5 py-0 gap-1">
                      {sections.map((s) => (
                        <TabsTrigger
                          key={s.id}
                          value={s.id}
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2.5 text-sm"
                        >
                          {s.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {sections.map((s) => (
                    <TabsContent
                      key={s.id}
                      value={s.id}
                      className="px-5 py-4 space-y-3 data-[state=inactive]:hidden"
                      forceMount
                    >
                      {s.fields.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Aucun contenu.
                        </p>
                      ) : (
                        s.fields.map((f) => (
                          <FieldView key={f.id} type={f.type} data={f.data} />
                        ))
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            {loading && sections.length === 0 && (
              <div className="flex-1 space-y-2 px-5 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-muted" />
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
