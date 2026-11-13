"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Waypoints } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/textFormatting";
import { messageErreurAction } from "@/lib/actionErrors";
import { acceptPersonaRelation, deletePersonaRelation } from "@/app/actions/personaRelations";
import type { PersonaRelation, WorldRelationType } from "@/types/relations";

/**
 * Les relations d'un persona, sur sa fiche.
 *
 * Elles ne se lisaient que dans le canevas du monde — une vue d'ensemble,
 * pas l'endroit où l'on regarde UN personnage. La fiche les donne en deux
 * listes : ce qu'il pense des autres, ce qu'on pense de lui. Une relation
 * réciproque acceptée existe dans les deux sens ; elle n'apparaît qu'une
 * fois, dans la première, marquée comme telle.
 *
 * Une demande en attente se répond ici aussi, pour le joueur du persona
 * visé — la notification n'est pas le seul chemin.
 */

type OtherPersona = { id: string; name: string; avatar_url: string | null; user_id: string;
  /** Le pseudo de son joueur, sous son nom. */
  username?: string | null };

export type RelationEntry = {
  rel: PersonaRelation;
  other: OtherPersona;
  type: WorldRelationType | null;
  /** Les deux sens existent, acceptés : une relation réciproque. */
  mutual: boolean;
};

export function PersonaRelationsSection({
  personaId,
  worldId,
  ownerId,
  selfId,
  canAdmin = false,
}: {
  personaId: string;
  worldId: string;
  /** Le joueur du persona de la fiche. */
  ownerId: string;
  /** Le joueur qui regarde — `null` hors connexion. */
  selfId: string | null;
  canAdmin?: boolean;
}) {
  const t = useTranslations("personas.relations");
  const tCommon = useTranslations("common");
  const [relations, setRelations] = useState<PersonaRelation[] | null>(null);
  const [others, setOthers] = useState<Map<string, OtherPersona>>(new Map());
  const [types, setTypes] = useState<Map<string, WorldRelationType>>(new Map());
  const isOwner = selfId === ownerId;
  // Un admin retire ou rompt ; répondre à une demande revient au seul joueur
  // du persona visé (migration 174).
  const canAct = canAdmin || isOwner;

  async function fetchAll() {
    const supabase = createClient();
    const [{ data: rels }, { data: typeRows }] = await Promise.all([
      supabase
        .from("persona_relations")
        .select("id, world_id, from_persona_id, to_persona_id, type, label, description, status, created_by, created_at")
        .eq("world_id", worldId)
        .or(`from_persona_id.eq.${personaId},to_persona_id.eq.${personaId}`),
      supabase
        .from("world_relation_types")
        .select("id, world_id, name, color, dash, sort_index, mutual, marital_status")
        .eq("world_id", worldId),
    ]);
    const list = (rels ?? []) as PersonaRelation[];
    const otherIds = [...new Set(list.map((r) => (r.from_persona_id === personaId ? r.to_persona_id : r.from_persona_id)))];
    let personas: OtherPersona[] = [];
    if (otherIds.length > 0) {
      const { data } = await supabase.from("personas").select("id, name, avatar_url, user_id").in("id", otherIds);
      personas = (data ?? []) as OtherPersona[];
      const userIds = [...new Set(personas.map((p) => p.user_id))];
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase.from("profiles").select("id, username").in("id", userIds);
        const usernames = new Map(((profileRows ?? []) as { id: string; username: string | null }[]).map((r) => [r.id, r.username]));
        personas = personas.map((p) => ({ ...p, username: usernames.get(p.user_id) ?? null }));
      }
    }
    return { list, personas, typeRows: (typeRows ?? []) as WorldRelationType[] };
  }

  function apply(result: Awaited<ReturnType<typeof fetchAll>>) {
    setOthers(new Map(result.personas.map((p) => [p.id, p])));
    setTypes(new Map(result.typeRows.map((tp) => [tp.id, tp])));
    setRelations(result.list);
  }

  useEffect(() => {
    let cancelled = false;
    setRelations(null);
    void fetchAll().then((result) => { if (!cancelled) apply(result); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, worldId]);

  const reload = () => void fetchAll().then(apply);

  async function accept(id: string) {
    const res = await acceptPersonaRelation(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    toast.success(t("accepted"));
    reload();
  }

  async function remove(id: string) {
    const res = await deletePersonaRelation(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    reload();
  }

  if (relations === null) {
    return (
      <div className="space-y-2" data-testid="relations-loading">
        {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
      </div>
    );
  }

  const acceptedKey = (from: string, to: string, type: string) => `${from}|${to}|${type}`;
  const accepted = new Set(relations.filter((r) => r.status === "accepted").map((r) => acceptedKey(r.from_persona_id, r.to_persona_id, r.type)));

  const out: RelationEntry[] = [];
  const incoming: RelationEntry[] = [];
  for (const rel of relations) {
    const isOut = rel.from_persona_id === personaId;
    const other = others.get(isOut ? rel.to_persona_id : rel.from_persona_id);
    if (!other) continue;
    const mutual = rel.status === "accepted"
      && accepted.has(acceptedKey(rel.to_persona_id, rel.from_persona_id, rel.type));
    const entry: RelationEntry = { rel, other, type: types.get(rel.type) ?? null, mutual };
    if (isOut) out.push(entry);
    // Le miroir d'une relation réciproque est déjà dans la première liste.
    else if (!mutual) incoming.push(entry);
  }
  const bySort = (a: RelationEntry, b: RelationEntry) =>
    (a.type?.sort_index ?? 999) - (b.type?.sort_index ?? 999) || a.other.name.localeCompare(b.other.name);
  out.sort(bySort);
  incoming.sort(bySort);

  const canvasHref = `/w/${worldId}?view=canvas&persona=${personaId}`;

  if (out.length === 0 && incoming.length === 0) {
    return (
      <div className="space-y-3">
        <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        <CanvasLink href={canvasHref} label={t("openCanvas")} />
      </div>
    );
  }

  // Les deux sens ne portent un titre que s'ils coexistent : seul, le sens se lit sur la carte.
  const titled = out.length > 0 && incoming.length > 0;

  return (
    <div className="space-y-5">
      {out.length > 0 && (
        <RelationGroup title={titled ? t("out") : null}>
          {out.map((e) => (
            <RelationCard key={e.rel.id} entry={e} direction="out"
              canRespond={false}
              canCancel={canAct && e.rel.status === "pending"}
              canBreak={canAct && e.mutual}
              onAccept={accept} onRemove={remove} />
          ))}
        </RelationGroup>
      )}
      {incoming.length > 0 && (
        <RelationGroup title={titled ? t("in") : null}>
          {incoming.map((e) => (
            <RelationCard key={e.rel.id} entry={e} direction="in"
              canRespond={isOwner && e.rel.status === "pending"}
              canCancel={false}
              canBreak={false}
              onAccept={accept} onRemove={remove} />
          ))}
        </RelationGroup>
      )}
      <CanvasLink href={canvasHref} label={t("openCanvas")} />
    </div>
  );
}

/** Le lien vers la page Relations du monde, centrée sur ce persona : une invite en pointillés. */
function CanvasLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
    >
      <Waypoints className="h-3.5 w-3.5" aria-hidden /> {label}
    </Link>
  );
}

function RelationGroup({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <SectionLabel as="h3">{title}</SectionLabel>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RelationCard({
  entry, direction, canRespond, canCancel, canBreak, onAccept, onRemove,
}: {
  entry: RelationEntry;
  direction: "out" | "in";
  canRespond: boolean;
  canCancel: boolean;
  canBreak: boolean;
  onAccept: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("personas.relations");
  const { rel, other, type, mutual } = entry;
  const color = type?.color ?? "var(--muted-foreground)";
  const pending = rel.status === "pending";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5",
        pending ? "border-dashed border-border" : "border-transparent",
      )}
    >
      <Avatar className="size-10 shrink-0 rounded-md">
        <AvatarImage src={other.avatar_url ?? undefined} alt="" className="object-cover" />
        <AvatarFallback className="rounded-md bg-muted text-xs font-semibold">{getInitials(other.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">{other.name}</p>
            {other.username && <p className="truncate text-xs text-muted-foreground">@{other.username}</p>}
          </div>
          {/* Le type : son trait (plein ou pointillé) et son nom, à sa couleur. */}
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-medium" style={{ color }}>
            {/* Le sens : réciproque, de lui vers l'autre, ou de l'autre vers lui. */}
            <span aria-hidden className="text-muted-foreground">
              {mutual ? "⇄" : direction === "out" ? "→" : "←"}
            </span>
            <svg aria-hidden width="16" height="2" className="shrink-0 overflow-visible">
              <line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray={type?.dash || undefined} />
            </svg>
            {type?.name ?? t("unknownType")}
          </span>
        </div>
        {pending && <Badge tone="outline" className="mt-1.5">{t("pending")}</Badge>}
        {rel.description && (
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">{rel.description}</p>
        )}
        {(canRespond || canCancel || canBreak) && (
          <div className="mt-2 flex items-center gap-1.5">
            {canRespond && (
              <>
                <Button type="button" size="xs" onClick={() => onAccept(rel.id)}>
                  <Check /> {t("accept")}
                </Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => onRemove(rel.id)}>
                  {t("decline")}
                </Button>
              </>
            )}
            {canCancel && (
              <Button type="button" variant="ghost" size="xs" onClick={() => onRemove(rel.id)}>
                {t("cancelRequest")}
              </Button>
            )}
            {canBreak && (
              <Button type="button" variant="ghost" size="xs" onClick={() => onRemove(rel.id)} className="hover:text-destructive">
                {t("breakRelation")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
