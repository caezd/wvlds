"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Network, X } from "lucide-react";

import { cn } from "@/lib/utils";
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

type OtherPersona = { id: string; name: string; avatar_url: string | null; user_id: string };

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
  const canAct = canAdmin || selfId === ownerId;

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
        {[1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
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
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
        <Link href={canvasHref} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          <Network className="h-3.5 w-3.5" /> {t("openCanvas")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {out.length > 0 && (
        <RelationGroup title={t("out")}>
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
        <RelationGroup title={t("in")}>
          {incoming.map((e) => (
            <RelationCard key={e.rel.id} entry={e} direction="in"
              canRespond={canAct && e.rel.status === "pending"}
              canCancel={false}
              canBreak={false}
              onAccept={accept} onRemove={remove} />
          ))}
        </RelationGroup>
      )}
      <Link href={canvasHref} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        <Network className="h-3.5 w-3.5" /> {t("openCanvas")}
      </Link>
    </div>
  );
}

function RelationGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</h3>
      <div className="space-y-1.5">{children}</div>
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
  const color = type?.color ?? "#94a3b8";
  const pending = rel.status === "pending";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2",
        pending ? "border-dashed border-border" : "border-border-soft",
      )}
      style={!pending ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
    >
      {other.avatar_url
        ? <Image src={other.avatar_url} alt="" width={28} height={28} className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
        : <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{getInitials(other.name)}</div>
      }
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium leading-tight">{other.name}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color }}>
            <span aria-hidden className="text-muted-foreground/60">{mutual ? "⇄" : direction === "out" ? "→" : "←"}</span>
            {type?.name ?? t("unknownType")}
          </span>
          {pending && (
            <span className="rounded-full border border-dashed border-border px-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("pending")}
            </span>
          )}
        </div>
        {rel.description && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">{rel.description}</p>
        )}
        {canRespond && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <button type="button" onClick={() => onAccept(rel.id)}
              className="flex h-6 items-center gap-1 rounded-lg bg-primary px-2 text-[11px] font-medium text-primary-foreground">
              <Check className="h-3 w-3" /> {t("accept")}
            </button>
            <button type="button" onClick={() => onRemove(rel.id)} aria-label={t("decline")}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {canCancel && (
          <button type="button" onClick={() => onRemove(rel.id)}
            className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {t("cancelRequest")}
          </button>
        )}
        {canBreak && (
          <button type="button" onClick={() => onRemove(rel.id)}
            className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-destructive">
            {t("breakRelation")}
          </button>
        )}
      </div>
    </div>
  );
}
