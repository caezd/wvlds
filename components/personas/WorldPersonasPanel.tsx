"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Drama, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/textFormatting";
import { PersonaCard } from "./PersonaCard";
import { PersonaCreateSheet } from "./PersonaCreateSheet";
import { PersonaProfileSheetTrigger } from "./PersonaProfileSheetTrigger";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AsidePersona } from "./WorldPersonaAsideClient";
import { useTranslations } from "next-intl";

type OtherPersona = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  user_id: string;
  username: string | null;
};

function memberLabel(userId: string, username: string | null) {
  return username ? `@${username}` : userId.slice(0, 8);
}

/** Lettre d'index (accents ignorés) ; "#" pour les noms vides ou non alphabétiques. */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function letterKey(name: string | null): string {
  const normalized = (name ?? "").trim().normalize("NFD").replace(DIACRITICS_RE, "");
  const c = normalized[0]?.toUpperCase() ?? "";
  return /[A-Z]/.test(c) ? c : "#";
}

// ── Carte lecture seule : persona d'un autre membre ────────────────────────

function OtherPersonaCard({ persona }: { persona: OtherPersona }) {
  const name = persona.name ?? "Sans nom";
  return (
    <PersonaProfileSheetTrigger
      personaId={persona.id}
      userId={persona.user_id}
      label={name}
      triggerClassName="group relative block w-full aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {persona.avatar_url ? (
        <Image
          src={persona.avatar_url}
          alt={name}
          fill
          sizes="(min-width: 1024px) 160px, 33vw"
          className="object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-2xl font-bold text-muted-foreground select-none">
          {getInitials(name, "P")}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <span className="block text-sm font-semibold text-white leading-tight line-clamp-2">
          {name}
        </span>
        <span className="block text-xs text-white/70 leading-tight truncate">
          {memberLabel(persona.user_id, persona.username)}
        </span>
      </div>
    </PersonaProfileSheetTrigger>
  );
}

// ── WorldPersonasPanel ──────────────────────────────────────────────────────

export function WorldPersonasPanel({
  worldId,
  myPersonas,
  restrictInventory = false,
  restrictSkills = false,
  faceclaimsEnabled,
}: {
  worldId: string;
  myPersonas: AsidePersona[];
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
}) {
  const t = useTranslations("worlds");
  const supabase = useMemo(() => createClient(), []);
  const [others, setOthers] = useState<OtherPersona[] | null>(null);
  const myIds = useMemo(() => new Set(myPersonas.map((p) => p.id)), [myPersonas]);

  useEffect(() => {
    let cancelled = false;

    async function loadOthers() {
      const { data: personaRows } = await supabase
        .from("personas")
        .select("id, name, avatar_url, user_id")
        .eq("world_id", worldId)
        .eq("is_template", false)
        .is("deleted_at", null);

      type RawPersona = { id: string; name: string | null; avatar_url: string | null; user_id: string };
      const otherRows = ((personaRows ?? []) as RawPersona[]).filter((r) => !myIds.has(r.id));
      const userIds = Array.from(new Set(otherRows.map((r) => r.user_id)));

      let usernameByUser = new Map<string, string | null>();
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);
        type ProfileRow = { id: string; username: string | null };
        usernameByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p.username]));
      }

      if (!cancelled) {
        setOthers(
          otherRows.map((r) => ({ ...r, username: usernameByUser.get(r.user_id) ?? null })),
        );
      }
    }

    void loadOthers();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  const mine = [...myPersonas].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" }),
  );

  const otherGroups = useMemo(() => {
    const sorted = [...(others ?? [])].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" }),
    );
    const map = new Map<string, OtherPersona[]>();
    for (const p of sorted) {
      const key = letterKey(p.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [others]);

  const loadingOthers = others === null;
  const otherTotal = others?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Drama className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={
          <>
            Personas
            {mine.length + otherTotal > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{mine.length + otherTotal}</span>
            )}
          </>
        }
        right={
          <PersonaCreateSheet
            worldId={worldId}
            restrictInventory={restrictInventory}
            restrictSkills={restrictSkills}
            trigger={
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau persona
              </button>
            }
          />
        }
      />

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-8 px-6 py-6">
          {/* ── Mes personas ── */}
          <section>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Mes personas
              {mine.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{mine.length}</span>
              )}
            </h3>

            {mine.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-soft py-10 text-center">
                <p className="text-sm text-muted-foreground">{t("noPersonaInWorld")}</p>
                <PersonaCreateSheet
                  worldId={worldId}
                  restrictInventory={restrictInventory}
                  restrictSkills={restrictSkills}
                  trigger={
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                    >
                      <Plus size={14} />
                      Créer un persona
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {mine.map((p) => (
                  <PersonaCard
                    key={p.id}
                    personaId={p.id}
                    personaName={p.name ?? "Sans nom"}
                    avatarUrl={p.avatar_url}
                    avatarConfig={p.avatar_config as never}
                    bannerUrl={p.banner_url}
                    initialFrameId={p.avatar_frame_id}
                    initialFrameUrl={p.frame?.asset_url}
                    initialFaceclaim={p.faceclaim ?? null}
                    initialMaritalStatus={p.marital_status ?? null}
                    initialSpousePersonaId={p.spouse_persona_id ?? null}
                    initialSections={p.sections}
                    worldId={worldId}
                    restrictInventory={restrictInventory}
                    restrictSkills={restrictSkills}
                    faceclaimsEnabled={faceclaimsEnabled}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Autres personas, indexés par lettre ── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Autres personas
              {otherTotal > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{otherTotal}</span>
              )}
            </h3>

            {loadingOthers ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : otherGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-soft py-8 text-center text-sm text-muted-foreground">
                Aucun autre persona pour le moment.
              </p>
            ) : (
              <div className="space-y-5">
                {otherGroups.map(([letter, list]) => (
                  <div key={letter}>
                    <div className="px-0.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {letter}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {list.map((p) => (
                        <OtherPersonaCard key={p.id} persona={p} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
