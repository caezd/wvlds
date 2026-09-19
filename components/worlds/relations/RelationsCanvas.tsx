"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Network, Pencil, Search, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Le canevas ne fait plus que deux choses : dessiner (blocs, cartes, flèches)
// et orchestrer. Les données et leurs écritures sont dans `useRelationsData`,
// le détail d'un persona dans `PersonaRelationsPanel`, la création et la
// modification dans `RelationDialog`, la légende filtrante dans
// `RelationsLegend`, la géométrie dans `geometry`, le déplacement et le zoom
// dans `useCanvasPanZoom`.
import type { CPersona, CRelType, CRelation } from "./types";
import { REL_W, CW, BP, NC, BLOCK_W, mid, blockH, cardCtr, bezierD, bezierMidPt, splitBezierHalves } from "./geometry";
import { useCanvasPanZoom } from "./useCanvasPanZoom";
import { useRelationsData } from "./useRelationsData";
import { PersonaRelationsPanel, FALLBACK_TYPE } from "./PersonaRelationsPanel";
import { PersonaCard } from "./PersonaCard";
import { RelationDialog } from "./RelationDialog";
import { RelationsLegend } from "./RelationsLegend";

/** Une relation en attente se dessine en pointillé clair : elle n'existe pas encore vraiment. */
const PENDING_DASH = "2 6";

export type RelationsCanvasProps = {
  worldId: string;
  userId: string;
  canAdmin: boolean;
};

export function RelationsCanvas({ worldId, userId, canAdmin }: RelationsCanvasProps) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const data = useRelationsData(worldId, userId, canAdmin);
  const {
    loading, personas, members, groups, relTypes, groupByPersona, relations, blockPos, ownerId,
    personaMap, relTypeMap, myPersonaIds, personasByUser, userList, canEditFrom, setBlockPos,
  } = data;
  const fallback: CRelType = React.useMemo(() => ({ ...FALLBACK_TYPE, name: t("unknown") }), [t]);

  // ── Sélection ──
  // `?persona=` : la fiche d'un persona mène ici, sur lui.
  const searchParams = useSearchParams();
  const requestedPersona = searchParams?.get("persona") ?? null;
  const [selectedPersonaId, setSelectedPersonaId] = React.useState<string | null>(requestedPersona);
  React.useEffect(() => { if (requestedPersona) setSelectedPersonaId(requestedPersona); }, [requestedPersona]);
  const selectedPersona = selectedPersonaId ? personaMap.get(selectedPersonaId) ?? null : null;

  // ── Dialogue de création / modification ──
  const [dialog, setDialog] = React.useState<{ from: CPersona; existing?: { rel: CRelation; to: CPersona } } | null>(null);
  function openCreate(from: CPersona) { setDialog({ from }); }
  function openEdit(rel: CRelation) {
    const from = personaMap.get(rel.from_persona_id);
    const to = personaMap.get(rel.to_persona_id);
    if (from && to) setDialog({ from, existing: { rel, to } });
  }

  // ── Filtres (légende) ──
  const [hiddenTypes, setHiddenTypes] = React.useState<ReadonlySet<string>>(() => new Set());
  const [hiddenGroups, setHiddenGroups] = React.useState<ReadonlySet<string>>(() => new Set());
  // Masquer les personas décédés ou retirés, et leurs relations avec eux.
  const [hideRetired, setHideRetired] = React.useState(false);
  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };
  const personaHidden = React.useCallback((pid: string) => {
    const gid = groupByPersona.get(pid);
    if (!!gid && hiddenGroups.has(gid)) return true;
    return hideRetired && isRetiredStatus(personaMap.get(pid)?.narrative_status);
  }, [groupByPersona, hiddenGroups, hideRetired, personaMap]);
  const hasRetired = React.useMemo(() => personas.some((p) => isRetiredStatus(p.narrative_status)), [personas]);
  const relationVisible = React.useCallback(
    (r: CRelation) => !hiddenTypes.has(r.type) && !personaHidden(r.from_persona_id) && !personaHidden(r.to_persona_id),
    [hiddenTypes, personaHidden],
  );

  // ── Recherche (en-tête) : filtre la liste mobile, estompe les cartes desktop ──
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);
  function closeSearch() { setSearch(""); setSearchOpen(false); }

  function ownerDisplayName(uid: string): string {
    const m = members.find((mm) => mm.user_id === uid);
    return m?.username ? `@${m.username}` : uid.slice(0, 8);
  }
  /** Un persona correspond si son nom OU le pseudo de son joueur matche. */
  function matchesSearch(p: CPersona): boolean {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || ownerDisplayName(p.user_id).toLowerCase().includes(q);
  }
  /** Liste mobile filtrée : un pseudo qui matche garde tous ses personas. */
  const filteredUserList = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return userList;
    return userList
      .map(({ member, ps }) => {
        const ownerMatches = ownerDisplayName(member.user_id).toLowerCase().includes(q);
        return { member, ps: ownerMatches ? ps : ps.filter((p) => p.name.toLowerCase().includes(q)) };
      })
      .filter(({ ps }) => ps.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userList, search, members]);

  // ── Demandes qui m'attendent : un badge dans l'en-tête ──
  const pendingForMe = React.useMemo(
    () => relations.filter((r) => r.status === "pending" && myPersonaIds.has(r.to_persona_id)).length,
    [relations, myPersonaIds],
  );
  /** Relations par persona, pour la liste mobile (un miroir accepté ne compte qu'une fois). */
  const countsByPersona = React.useMemo(() => {
    const counts = new Map<string, { total: number; pending: number }>();
    const acceptedKeys = new Set(relations.filter((r) => r.status === "accepted").map((r) => `${r.from_persona_id}|${r.to_persona_id}|${r.type}`));
    const bump = (pid: string, pending: boolean) => {
      const c = counts.get(pid) ?? { total: 0, pending: 0 };
      c.total++;
      if (pending) c.pending++;
      counts.set(pid, c);
    };
    for (const r of relations) {
      bump(r.from_persona_id, false);
      const mirrored = r.status === "accepted" && acceptedKeys.has(`${r.to_persona_id}|${r.from_persona_id}|${r.type}`);
      if (!mirrored) bump(r.to_persona_id, r.status === "pending");
    }
    return counts;
  }, [relations]);

  // ── Groupes : pastille + sélecteur ──
  const [openGroupPicker, setOpenGroupPicker] = React.useState<{ personaId: string; x: number; y: number } | null>(null);
  const groupColor = React.useMemo(() => {
    const m = new Map<string, string>();
    const gMap = new Map(groups.map((g) => [g.id, g.color]));
    for (const [pid, gid] of groupByPersona) {
      const c = gMap.get(gid);
      if (c) m.set(pid, c);
    }
    return m;
  }, [groupByPersona, groups]);

  // ── Déplacement des blocs, pan et zoom ──
  const drag = React.useRef<{ uid: string; mx0: number; my0: number; x0: number; y0: number } | null>(null);
  const {
    pan, setPan, scale, setScale, scaleRef, outerRef, canvasRef,
    onCanvasDown, onCanvasMove, onCanvasUp, onTouchStart, onTouchMove, onTouchEnd,
  } = useCanvasPanZoom(() => drag.current !== null);

  function onHdrDown(e: React.PointerEvent, uid: string) {
    if (uid !== userId && userId !== ownerId) return;
    e.preventDefault();
    e.stopPropagation();
    const p = blockPos.get(uid) ?? { x: 0, y: 0 };
    drag.current = { uid, mx0: e.clientX, my0: e.clientY, x0: p.x, y0: p.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHdrMove(e: React.PointerEvent, uid: string) {
    if (!drag.current || drag.current.uid !== uid) return;
    const s = scaleRef.current;
    const nx = Math.max(0, drag.current.x0 + (e.clientX - drag.current.mx0) / s);
    const ny = Math.max(0, drag.current.y0 + (e.clientY - drag.current.my0) / s);
    setBlockPos((prev) => new Map(prev).set(uid, { x: nx, y: ny }));
  }
  function onHdrUp(e: React.PointerEvent, uid: string) {
    if (!drag.current || drag.current.uid !== uid) return;
    const s = scaleRef.current;
    const nx = Math.max(0, drag.current.x0 + (e.clientX - drag.current.mx0) / s);
    const ny = Math.max(0, drag.current.y0 + (e.clientY - drag.current.my0) / s);
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    void data.savePos(uid, nx, ny);
  }

  // ── Géométrie dérivée ──
  const personaCenters = React.useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [uid, ps] of personasByUser) {
      const pos = blockPos.get(uid);
      if (!pos) continue;
      ps.forEach((p, i) => m.set(p.id, cardCtr(pos.x, pos.y, i)));
    }
    return m;
  }, [personasByUser, blockPos]);

  let maxW = 600, maxH = 400;
  for (const [uid, pos] of blockPos) {
    const n = personasByUser.get(uid)?.length ?? 0;
    maxW = Math.max(maxW, pos.x + BLOCK_W + 40);
    maxH = Math.max(maxH, pos.y + blockH(n) + 40);
  }

  // Flèches : une par relation, sauf les deux sens d'une même paire, fondus en
  // une double flèche (même type) ou coupés en deux moitiés (types différents).
  // Une relation en attente reste seule : elle n'existe pas encore vraiment.
  const [hovRelId, setHovRelId] = React.useState<string | null>(null);
  const arrowItems = React.useMemo(() => {
    const visible = relations.filter(relationVisible);
    const pairMap = new Map<string, CRelation>();
    for (const r of visible) pairMap.set(`${r.from_persona_id}__${r.to_persona_id}`, r);
    const rendered = new Set<string>();
    const items: Array<
      | { kind: "single"; rel: CRelation }
      | { kind: "bidir"; rel: CRelation }
      | { kind: "split"; relAB: CRelation; relBA: CRelation }
    > = [];
    for (const rel of visible) {
      const key = `${rel.from_persona_id}__${rel.to_persona_id}`;
      const revKey = `${rel.to_persona_id}__${rel.from_persona_id}`;
      if (rendered.has(key)) continue;
      const reverse = pairMap.get(revKey);
      if (!reverse || rel.status === "pending" || reverse.status === "pending") {
        items.push({ kind: "single", rel });
      } else if (reverse.type === rel.type) {
        items.push({ kind: "bidir", rel });
        rendered.add(key); rendered.add(revKey);
      } else {
        items.push({ kind: "split", relAB: rel, relBA: reverse });
        rendered.add(key); rendered.add(revKey);
      }
    }
    return items;
  }, [relations, relationVisible]);

  /** La bulle au survol d'une flèche : le type, et les commandes de qui peut écrire. */
  function arrowLabel(rel: CRelation, meta: CRelType, x: number, y: number, suffix = "") {
    const editable = canEditFrom(rel.from_persona_id);
    return (
      <foreignObject x={x - 60} y={y - 14} width="120" height="28"
        className="pointer-events-auto overflow-visible"
        onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)}>
        <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md">
          <span className="text-[10px] font-semibold" style={{ color: meta.color }}>
            {meta.name}{suffix}{rel.status === "pending" ? ` · ${t("pending")}` : ""}
          </span>
          {editable && rel.status !== "pending" && (
            <button onClick={() => openEdit(rel)} className="text-muted-foreground hover:text-foreground" aria-label={t("editRelation")}>
              <Pencil style={{ width: 10, height: 10 }} />
            </button>
          )}
          {editable && (
            <button onClick={() => void data.deleteRelation(rel.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
              <Trash2 style={{ width: 10, height: 10 }} />
            </button>
          )}
        </div>
      </foreignObject>
    );
  }

  const panelProps = selectedPersona ? {
    persona: selectedPersona,
    owner: members.find((m) => m.user_id === selectedPersona.user_id),
    relations, personaMap, relTypeMap, userId, canAdmin,
    onAdd: canEditFrom(selectedPersona.id) ? () => openCreate(selectedPersona) : undefined,
    onEdit: openEdit,
    onUpdateDesc: (id: string, desc: string) => void data.updateRelation(id, { description: desc || null }),
    onDelete: (id: string) => void data.deleteRelation(id),
    onAccept: (id: string) => void data.acceptRelation(id),
  } : null;

  return (
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Network className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          <>
            {pendingForMe > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {t("pendingCount", { count: pendingForMe })}
              </span>
            )}
            {searchOpen ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  className="h-7 w-40 rounded-md border border-border-soft bg-background pl-7 pr-7 text-xs outline-none focus:border-primary/40"
                />
                <button type="button" onClick={closeSearch} aria-label={t("clearSearch")}
                  className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("searchPlaceholder")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Search className="h-4 w-4" />
              </button>
            )}
          </>
        }
      />

      {/* ── Grand écran : colonne latérale + canevas ── */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        {panelProps && (
          <div className="flex w-72 shrink-0 flex-col border-r border-border-soft bg-background">
            <PersonaRelationsPanel {...panelProps} onClose={() => setSelectedPersonaId(null)} closeLabel={tCommon("close")} onHoverRelation={setHovRelId} />
          </div>
        )}

        <div
          ref={outerRef}
          className="relative flex-1 overflow-hidden"
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Grille de points, fixe dans la fenêtre */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width="100%" height="100%" style={{ zIndex: 0 }}>
            <defs>
              <pattern id="canvas-dot-grid" x={pan.x % 28} y={pan.y % 28} width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="14" cy="14" r="1" style={{ fill: "var(--border)" }} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
          </svg>

          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{tCommon("loading")}</div>
          ) : (
            <div ref={canvasRef} className="absolute origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, width: maxW, height: maxH }}>
              {userList.map(({ member, ps }) => {
                const uid = member.user_id;
                const pos = blockPos.get(uid) ?? { x: 0, y: 0 };
                const dName = member.username ? `@${member.username}` : uid.slice(0, 8);
                const letter = dName.replace(/^@/, "")[0]?.toUpperCase() ?? "?";
                return (
                  <div key={uid} className="absolute" style={{ left: pos.x, top: pos.y, width: BLOCK_W }} onPointerDown={(e) => e.stopPropagation()}>
                    <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 backdrop-blur-sm" style={{ height: blockH(ps.length) }}>
                      <div
                        className={cn("flex h-[42px] select-none items-center gap-2 rounded-t-xl px-3",
                          (uid === userId || userId === ownerId) ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
                        onPointerDown={(e) => onHdrDown(e, uid)}
                        onPointerMove={(e) => onHdrMove(e, uid)}
                        onPointerUp={(e) => onHdrUp(e, uid)}
                        onPointerCancel={(e) => onHdrUp(e, uid)}
                      >
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-bold">
                          {member.avatar_url ? <Image src={member.avatar_url} alt={dName} fill sizes="24px" className="object-cover" /> : letter}
                        </span>
                        <span className="truncate text-xs font-medium text-muted-foreground">{dName}</span>
                      </div>

                      <div className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${NC}, ${CW}px)`, padding: `${BP}px`, paddingTop: 0, paddingBottom: BP }}>
                        {ps.map((p) => {
                          const gc = groupColor.get(p.id);
                          const counts = countsByPersona.get(p.id);
                          return (
                            <PersonaCard
                              key={p.id}
                              persona={p}
                              groupColor={gc}
                              selected={selectedPersonaId === p.id}
                              dimmed={(search.trim() !== "" && !matchesSearch(p)) || personaHidden(p.id)}
                              pendingCount={p.user_id === userId ? (counts?.pending ?? 0) : 0}
                              onSelect={() => setSelectedPersonaId((v) => (v === p.id ? null : p.id))}
                              corner={(canAdmin || p.user_id === userId) && groups.length > 0 ? (
                                <button
                                  type="button"
                                  aria-label={t("changeGroup")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openGroupPicker?.personaId === p.id) { setOpenGroupPicker(null); return; }
                                    const dotRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const outerEl = outerRef.current;
                                    if (!outerEl) return;
                                    const cr = outerEl.getBoundingClientRect();
                                    setOpenGroupPicker({ personaId: p.id, x: dotRect.left - cr.left + dotRect.width + 4, y: dotRect.top - cr.top });
                                  }}
                                  className="h-2.5 w-2.5 rounded-full border border-background/60 shadow-sm"
                                  style={{ background: gc ?? "#94a3b8" }}
                                />
                              ) : undefined}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Flèches */}
              <svg className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }} width={maxW} height={maxH}>
                <defs>
                  {[...relTypes, fallback].map((tp) => (
                    <marker key={tp.id} id={mid(tp.id)} markerWidth="10" markerHeight="14" refX="9" refY="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                      <path d="M1,1 L9,7 L1,13" fill="none" stroke={tp.color} strokeWidth={REL_W} strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                  ))}
                </defs>

                {arrowItems.map((item) => {
                  if (item.kind === "split") {
                    const { relAB, relBA } = item;
                    const a = personaCenters.get(relAB.from_persona_id);
                    const b = personaCenters.get(relAB.to_persona_id);
                    if (!a || !b) return null;
                    const metaAB = relTypeMap.get(relAB.type) ?? fallback;
                    const metaBA = relTypeMap.get(relBA.type) ?? fallback;
                    const { dMidToA, dMidToB, mid: mp } = splitBezierHalves(a.x, a.y, b.x, b.y);
                    const hovAB = hovRelId === relAB.id;
                    const hovBA = hovRelId === relBA.id;
                    const hov = hovAB || hovBA;
                    return (
                      <g key={`split-${relAB.id}`}>
                        <path d={bezierD(a.x, a.y, b.x, b.y)} fill="none" stroke="transparent" strokeWidth="18"
                          className="pointer-events-auto cursor-pointer"
                          onMouseEnter={() => setHovRelId(relAB.id)} onMouseLeave={() => setHovRelId(null)} />
                        <path d={dMidToB} fill="none" stroke={metaAB.color} strokeWidth={hovAB ? REL_W + 1 : REL_W}
                          strokeDasharray={metaAB.dash || undefined} opacity={hov ? 1 : 0.75} markerEnd={`url(#${mid(metaAB.id)})`} />
                        <path d={dMidToA} fill="none" stroke={metaBA.color} strokeWidth={hovBA ? REL_W + 1 : REL_W}
                          strokeDasharray={metaBA.dash || undefined} opacity={hov ? 1 : 0.75} markerEnd={`url(#${mid(metaBA.id)})`} />
                        {hov && arrowLabel(hovBA ? relBA : relAB, hovBA ? metaBA : metaAB, mp.x, mp.y)}
                      </g>
                    );
                  }

                  const { rel } = item;
                  const a = personaCenters.get(rel.from_persona_id);
                  const b = personaCenters.get(rel.to_persona_id);
                  if (!a || !b) return null;
                  const meta = relTypeMap.get(rel.type) ?? fallback;
                  const d = bezierD(a.x, a.y, b.x, b.y);
                  const mp = bezierMidPt(a.x, a.y, b.x, b.y);
                  const hov = hovRelId === rel.id;
                  const pending = rel.status === "pending";
                  return (
                    <g key={`${item.kind}-${rel.id}`}>
                      <path d={d} fill="none" stroke="transparent" strokeWidth="18"
                        className="pointer-events-auto cursor-pointer"
                        onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)} />
                      <path d={d} fill="none" stroke={meta.color} strokeWidth={hov ? REL_W + 1 : REL_W}
                        strokeDasharray={pending ? PENDING_DASH : (meta.dash || undefined)}
                        opacity={pending ? (hov ? 0.7 : 0.4) : (hov ? 1 : 0.75)}
                        markerStart={item.kind === "bidir" ? `url(#${mid(meta.id)})` : undefined}
                        markerEnd={`url(#${mid(meta.id)})`} />
                      {hov && arrowLabel(rel, meta, mp.x, mp.y, item.kind === "bidir" ? " ⇄" : "")}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Sélecteur de groupe — hors transformation, en coordonnées de la fenêtre */}
          {openGroupPicker && (
            <>
              <div className="absolute inset-0" style={{ zIndex: 40 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpenGroupPicker(null)} />
              <div className="absolute flex min-w-[128px] flex-col gap-0.5 rounded-xl border border-border bg-background p-1.5 shadow-xl"
                style={{ left: openGroupPicker.x, top: openGroupPicker.y, zIndex: 50 }} onPointerDown={(e) => e.stopPropagation()}>
                {groups.map((g) => (
                  <button key={g.id} onClick={() => { void data.assignGroup(openGroupPicker.personaId, g.id); setOpenGroupPicker(null); }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[10px] hover:bg-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                    {g.name}
                  </button>
                ))}
                <button onClick={() => { void data.assignGroup(openGroupPicker.personaId, null); setOpenGroupPicker(null); }}
                  className="rounded-lg px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted">
                  {t("noGroup")}
                </button>
              </div>
            </>
          )}

          {/* Zoom */}
          <div className="absolute bottom-3 right-3 z-50 flex flex-col gap-1">
            <button type="button" onClick={() => setScale((s) => Math.min(4, s * 1.25))} aria-label={tCommon("zoomIn")} onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-sm shadow hover:bg-muted">+</button>
            <button type="button" onClick={() => setScale((s) => Math.max(0.15, s / 1.25))} aria-label={tCommon("zoomOut")} onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-sm shadow hover:bg-muted">−</button>
            <button type="button" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} aria-label={t("resetView")} title={t("resetView")} onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-[10px] shadow hover:bg-muted">⌂</button>
          </div>
        </div>
      </div>

      {/* ── Petit écran : les cartes des personas, puis le détail ──
          Le canevas (position libre, courbes, pan/zoom) est illisible en
          petit écran. À la place, une rangée de cartes par joueur — les mêmes
          cartes que les blocs du canevas — qu'on fait défiler de droite à
          gauche ; taper une carte ouvre le même panneau que la colonne
          desktop. ── */}
      <div data-testid="relations-mobile" className="flex min-h-0 flex-1 flex-col lg:hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{tCommon("loading")}</div>
        ) : panelProps ? (
          <PersonaRelationsPanel {...panelProps} onClose={() => setSelectedPersonaId(null)} closeLabel={tCommon("back")} closeIcon="back" />
        ) : (
          <div className="flex-1 overflow-y-auto py-1">
            {filteredUserList.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground/60">
                {search.trim() ? t("noSearchResults") : t("noPersonas")}
              </p>
            ) : filteredUserList.map(({ member, ps }) => {
              const dName = member.username ? `@${member.username}` : member.user_id.slice(0, 8);
              const letter = dName.replace(/^@/, "")[0]?.toUpperCase() ?? "?";
              return (
                <section key={member.user_id} aria-label={dName} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-bold">
                      {member.avatar_url ? <Image src={member.avatar_url} alt={dName} fill sizes="20px" className="object-cover" /> : letter}
                    </span>
                    <span className="truncate text-xs font-medium text-muted-foreground">{dName}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/60">{ps.length}</span>
                  </div>
                  {/* ScrollArea plutôt qu'un simple overflow : à la souris, sans
                      barre, une rangée qui déborde ne se parcourt pas. `snap-x` :
                      au doigt, le défilement s'arrête carte par carte. */}
                  <ScrollArea className="-mx-1">
                    <div className="flex snap-x gap-3 px-1 pb-3 pt-1">
                      {ps.map((p) => {
                        const counts = countsByPersona.get(p.id);
                        return (
                          <PersonaCard
                            key={p.id}
                            persona={p}
                            groupColor={groupColor.get(p.id)}
                            dimmed={personaHidden(p.id)}
                            pendingCount={p.user_id === userId ? (counts?.pending ?? 0) : 0}
                            relationCount={counts?.total ?? 0}
                            onSelect={() => setSelectedPersonaId(p.id)}
                            className="shrink-0 snap-start"
                          />
                        );
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Légende, qui filtre ── */}
      {(relTypes.length > 0 || groups.length > 0 || hasRetired) && (
        <RelationsLegend
          relTypes={relTypes}
          groups={groups}
          hiddenTypes={hiddenTypes}
          hiddenGroups={hiddenGroups}
          onToggleType={(id) => setHiddenTypes((s) => toggle(s, id))}
          onToggleGroup={(id) => setHiddenGroups((s) => toggle(s, id))}
          hideRetired={hasRetired ? hideRetired : undefined}
          onToggleRetired={() => setHideRetired((v) => !v)}
          onReset={() => { setHiddenTypes(new Set()); setHiddenGroups(new Set()); setHideRetired(false); }}
          className="shrink-0 border-t border-border-soft px-4 py-2"
        />
      )}

      {dialog && (
        <RelationDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          from={dialog.from}
          personas={personas}
          relTypes={relTypes}
          myPersonaIds={myPersonaIds}
          existing={dialog.existing ?? null}
          onCreate={(input) => data.createRelation({ fromPersonaId: dialog.from.id, ...input })}
          onUpdate={(id, patch) => data.updateRelation(id, patch)}
        />
      )}
    </div>
  );
}
