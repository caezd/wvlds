"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CountPip } from "@/components/ui/count-pip";
import { SectionLabel } from "@/components/ui/section-label";
import { getLeadingLetter } from "@/lib/textFormatting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NO_GROUP_RING, PersonaAvatar } from "./PersonaNode";
import { RelationTypeFilter, TypeStroke } from "./RelationsLegend";
import type { CGroup, CMember, CPersona, CRelType, CRelation } from "./types";

// Le panneau de droite du canevas, sur grand écran. Trois états :
// - rien de choisi : la vue d'ensemble (chiffres, types qui filtrent, joueurs) ;
// - un joueur : ses personas ;
// - un persona : sa fiche et ses relations, demandes reçues en tête.

type Row = {
  rel: CRelation;
  other: CPersona;
  meta: CRelType;
  direction: "mutual" | "out" | "in";
  description: string;
  /** Demande reçue, à laquelle le joueur peut répondre. */
  incoming: boolean;
  /** Demande envoyée, pas encore acceptée. */
  outgoing: boolean;
};

/**
 * Les lignes de la fiche d'un persona. Une relation réciproque acceptée
 * existe dans les deux sens : elle ne fait qu'une ligne, marquée
 * « réciproque ».
 */
export function personaRows(
  persona: CPersona,
  relations: CRelation[],
  personaMap: ReadonlyMap<string, CPersona>,
  typeOf: (id: string) => CRelType,
  userId: string,
): Row[] {
  const isMine = persona.user_id === userId;
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const rel of relations) {
    if (rel.from_persona_id !== persona.id && rel.to_persona_id !== persona.id) continue;
    const otherId = rel.from_persona_id === persona.id ? rel.to_persona_id : rel.from_persona_id;
    const other = personaMap.get(otherId);
    if (!other) continue;
    const meta = typeOf(rel.type);
    const mirror = rel.status === "accepted"
      ? relations.find((x) => x.from_persona_id === rel.to_persona_id && x.to_persona_id === rel.from_persona_id && x.type === rel.type && x.status === "accepted")
      : undefined;
    const key = [otherId, rel.type, mirror ? "mutual" : rel.from_persona_id, rel.status].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const pending = rel.status === "pending";
    out.push({
      rel,
      other,
      meta,
      direction: meta.mutual || mirror ? "mutual" : rel.from_persona_id === persona.id ? "out" : "in",
      description: rel.description || mirror?.description || "",
      // Répondre revient au joueur du persona visé, à lui seul (migration 174).
      incoming: pending && rel.to_persona_id === persona.id && isMine,
      outgoing: pending && !(rel.to_persona_id === persona.id && isMine),
    });
  }
  // Les demandes reçues d'abord : elles attendent un geste.
  return out.sort((a, b) => Number(b.incoming) - Number(a.incoming));
}

/** Pastille d'un joueur : son avatar, sinon l'initiale de son pseudo. */
function MemberChip({ member, handle, size }: { member: CMember | undefined; handle: string; size: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold text-foreground",
        size === "sm" ? "size-[22px] text-2xs" : "size-10 text-sm",
      )}
    >
      {member?.avatar_url
        ? <Image src={member.avatar_url} alt="" fill sizes={size === "sm" ? "22px" : "40px"} className="object-cover" />
        : getLeadingLetter(handle)}
    </span>
  );
}

const ROW = "flex w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-foreground transition-colors hover:bg-muted";

export type SidePanelProps = {
  /** Le persona dont on lit la fiche, ou rien. */
  persona: CPersona | null;
  /** Le joueur choisi (fiche joueur, ou retour depuis un de ses personas). */
  playerId: string | null;
  personas: CPersona[];
  members: CMember[];
  /** Joueurs qui ont au moins un persona, dans l'ordre du cercle. */
  players: Array<{ member: CMember; ps: CPersona[] }>;
  relations: CRelation[];
  relTypes: CRelType[];
  personaMap: ReadonlyMap<string, CPersona>;
  typeOf: (id: string) => CRelType;
  groups: CGroup[];
  groupByPersona: ReadonlyMap<string, string>;
  groupColorOf: (personaId: string) => string | undefined;
  handleOf: (userId: string) => string;
  statusOf: (persona: CPersona) => string;
  /** Relations de chaque persona (un miroir réciproque compte une fois). */
  relationCountOf: (personaId: string) => number;
  pendingByPersona: ReadonlyMap<string, number>;
  typeCounts: ReadonlyMap<string, number>;
  hiddenTypes: ReadonlySet<string>;
  onToggleType: (id: string) => void;
  onShowAllTypes: () => void;
  userId: string;
  canAdmin: boolean;
  canEditFrom: (personaId: string) => boolean;
  onAssignGroup: (personaId: string, groupId: string | null) => void;
  onClose: () => void;
  onBack: () => void;
  onOpenPersona: (id: string) => void;
  onSelectPlayer: (userId: string) => void;
  onHoverPersona: (id: string | null) => void;
  onHoverUser: (id: string | null) => void;
  onHoverRelation: (id: string | null) => void;
  onAccept: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (rel: CRelation) => void;
  onAdd: (persona: CPersona) => void;
};

export function RelationsSidePanel(props: SidePanelProps) {
  const t = useTranslations("relations");
  const { persona, playerId } = props;
  const label = persona ? persona.name : playerId ? props.handleOf(playerId) : t("overview");
  return (
    <aside
      aria-label={label}
      className="flex w-[clamp(240px,26vw,320px)] shrink-0 cursor-default flex-col border-l border-border bg-background"
    >
      {persona
        ? <PersonaSheet key={persona.id} {...props} persona={persona} />
        : playerId
          ? <PlayerSheet {...props} playerId={playerId} />
          : <Overview {...props} />}
    </aside>
  );
}

function Overview({
  personas, players, relTypes, typeCounts, hiddenTypes, onToggleType, onShowAllTypes, handleOf, onSelectPlayer, onHoverUser,
}: SidePanelProps) {
  const t = useTranslations("relations");
  const total = [...typeCounts.values()].reduce((n, c) => n + c, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-4 py-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("overview")}</h2>
        <p className="text-xs text-muted-foreground">
          {[t("personaCount", { count: personas.length }), t("playerCount", { count: players.length }), t("relationCount", { count: total })].join(" · ")}
        </p>
      </div>
      <div className="-mx-2">
        <RelationTypeFilter
          relTypes={relTypes}
          typeCounts={typeCounts}
          hiddenTypes={hiddenTypes}
          onToggleType={onToggleType}
          onShowAll={onShowAllTypes}
        />
      </div>
      <section className="-mx-2 flex flex-col gap-0.5">
        <SectionLabel className="px-2 pb-1.5">{t("players")}</SectionLabel>
        {players.map(({ member, ps }) => {
          const handle = handleOf(member.user_id);
          return (
            <button
              key={member.user_id}
              type="button"
              data-player-row={member.user_id}
              onClick={() => onSelectPlayer(member.user_id)}
              onMouseEnter={() => onHoverUser(member.user_id)}
              onMouseLeave={() => onHoverUser(null)}
              className={cn(ROW, "h-[34px]")}
            >
              <MemberChip member={member} handle={handle} size="sm" />
              <span className="min-w-0 flex-1 truncate">{handle}</span>
              <span className="text-xs-plus tabular-nums text-muted-foreground">{t("personaCount", { count: ps.length })}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function PlayerSheet({
  playerId, players, members, relations, personaMap, handleOf, statusOf, relationCountOf, groupColorOf, pendingByPersona, userId,
  onClose, onOpenPersona, onHoverPersona,
}: SidePanelProps & { playerId: string }) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const member = members.find((m) => m.user_id === playerId);
  const ps = players.find((p) => p.member.user_id === playerId)?.ps ?? [];
  const relCount = relations.filter((r) => personaMap.get(r.from_persona_id)?.user_id === playerId || personaMap.get(r.to_persona_id)?.user_id === playerId).length;
  const handle = handleOf(playerId);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <MemberChip member={member} handle={handle} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{handle}</h2>
          <p className="text-xs text-muted-foreground">
            {t("personaCount", { count: ps.length })} · {t("relationCount", { count: relCount })}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tCommon("close")}>
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2.5">
        {ps.map((p) => {
          const n = relationCountOf(p.id);
          const pending = p.user_id === userId ? pendingByPersona.get(p.id) ?? 0 : 0;
          const retired = p.narrative_status && p.narrative_status !== "alive";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenPersona(p.id)}
              onMouseEnter={() => onHoverPersona(p.id)}
              onMouseLeave={() => onHoverPersona(null)}
              className={cn(ROW, "py-[7px]")}
            >
              <PersonaAvatar persona={p} groupColor={groupColorOf(p.id)} imageSizes="30px" dim={false} className="size-[30px] text-xs-plus" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                <span className="block text-xs-plus text-muted-foreground">
                  {t("relationCount", { count: n })}{retired ? ` · ${statusOf(p)}` : ""}
                </span>
              </span>
              <CountPip count={pending} title={t("pendingCount", { count: pending })} />
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonaSheet({
  persona, playerId, relations, relTypes, personaMap, typeOf, groups, groupByPersona, groupColorOf, handleOf, statusOf,
  userId, canAdmin, canEditFrom, onAssignGroup, onClose, onBack, onOpenPersona, onHoverRelation, onAccept, onDelete, onEdit, onAdd,
}: SidePanelProps & { persona: CPersona }) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const groupId = groupByPersona.get(persona.id);
  const group = groupId ? groups.find((g) => g.id === groupId) : undefined;
  const color = group?.color;
  const rows = React.useMemo(
    () => personaRows(persona, relations, personaMap, typeOf, userId),
    [persona, relations, personaMap, typeOf, userId],
  );
  const canChangeGroup = canAdmin || persona.user_id === userId;
  const canAdd = canEditFrom(persona.id) && relTypes.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── En-tête ── */}
      <div className="relative flex flex-col items-center gap-2.5 border-b border-border px-5 pb-4 pt-[22px] text-center">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tCommon("close")} className="absolute right-2.5 top-2.5">
          <X />
        </Button>
        {playerId && (
          <Button variant="ghost" size="sm" onClick={onBack} className="absolute left-2.5 top-2.5 max-w-[45%] text-xs">
            <ChevronLeft />
            <span className="truncate">{handleOf(playerId)}</span>
          </Button>
        )}
        <PersonaAvatar
          persona={persona}
          groupColor={color}
          imageSizes="64px"
          dim={false}
          ring={`0 0 0 2px var(--background), 0 0 0 3.5px ${color ?? NO_GROUP_RING}`}
          className="size-16 text-xl"
        />
        <div className="min-w-0 max-w-full">
          <h2 className="truncate text-base font-semibold">{persona.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{handleOf(persona.user_id)} · {statusOf(persona)}</p>
        </div>
        {canChangeGroup && groups.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" aria-label={t("changeGroup")}>
                <BadgeDot color={color} className="size-[7px] rounded-full" />
                {group?.name ?? t("noGroup")}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-40">
              {groups.map((g) => (
                <DropdownMenuItem key={g.id} onSelect={() => onAssignGroup(persona.id, g.id)}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />
                  {g.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAssignGroup(persona.id, null)} className="text-muted-foreground">
                {t("noGroup")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : group ? (
          <Badge>
            <BadgeDot color={group.color} />
            {group.name}
          </Badge>
        ) : null}
      </div>

      {/* ── Relations ── */}
      <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3">
        <SectionLabel as="h3">{t("panelRelations", { count: rows.length })}</SectionLabel>
        {canAdd && (
          <Button variant="outline" size="xs" onClick={() => onAdd(persona)} aria-label={t("addRelation")} title={t("addRelation")}>
            <Plus aria-hidden />
            {tCommon("add")}
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {rows.length === 0 ? (
          <p className="px-3 py-5 text-center text-sm text-muted-foreground">{t("noRelations")}</p>
        ) : rows.map((row) => (
          <RelationLine
            key={row.rel.id}
            row={row}
            handle={handleOf(row.other.user_id)}
            otherColor={groupColorOf(row.other.id)}
            canWrite={canEditFrom(row.rel.from_persona_id)}
            onOpen={() => onOpenPersona(row.other.id)}
            onHover={onHoverRelation}
            onAccept={onAccept}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function RelationLine({
  row, handle, otherColor, canWrite, onOpen, onHover, onAccept, onDelete, onEdit,
}: {
  row: Row;
  handle: string;
  otherColor: string | undefined;
  canWrite: boolean;
  onOpen: () => void;
  onHover: (id: string | null) => void;
  onAccept: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (rel: CRelation) => void;
}) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const { rel, other, meta, incoming, outgoing } = row;
  const dirLabel = row.direction === "mutual" ? t("dirMutual") : row.direction === "out" ? t("dirOut") : t("dirIn");

  return (
    <div
      data-relation-row={rel.id}
      className={cn("group/row flex flex-col gap-1.5 rounded-lg p-2 transition-colors hover:bg-muted", incoming && "bg-accent/10")}
      onMouseEnter={() => onHover(rel.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={other.name}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PersonaAvatar persona={other} groupColor={otherColor} imageSizes="30px" dim={false} className="size-[30px] text-xs-plus" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {other.name} <span className="text-xs-plus font-normal text-muted-foreground">{handle}</span>
          </p>
          <p className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs" style={{ color: meta.color }}>
            <TypeStroke type={meta} width={14} />
            <span className="truncate">{meta.name}</span>
            <span className="shrink-0 text-muted-foreground">· {dirLabel}</span>
          </p>
        </div>
        {canWrite && !incoming && rel.status === "accepted" && (
          <button
            type="button"
            onClick={() => onEdit(rel)}
            aria-label={t("editRelation")}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-7 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100")}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {canWrite && !incoming && (
          <button
            type="button"
            onClick={() => onDelete(rel.id)}
            aria-label={outgoing ? t("cancelRequest") : tCommon("delete")}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-7 hover:text-destructive")}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {row.description && (
        <p className="whitespace-pre-wrap pl-10 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
      )}
      {incoming && (
        <div className="flex items-center gap-1.5 pl-10">
          <span className="flex-1 text-xs-plus text-accent">{t("incomingRequest")}</span>
          <Button variant="secondary" size="xs" onClick={() => onDelete(rel.id)}>{t("decline")}</Button>
          <Button size="xs" onClick={() => onAccept(rel.id)}>{t("accept")}</Button>
        </div>
      )}
      {outgoing && <p className="pl-10 text-xs-plus text-muted-foreground">{t("awaitingReply")}</p>}
    </div>
  );
}
