"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Link2, Network, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/textFormatting";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

// La géométrie du canevas — disposition des cartes et tracé des flèches — est
// dans `./geometry`, sans dépendance à React : ce sont des fonctions pures,
// testées directement. Les formes de données sont dans `./types`, et la ligne
// d'une relation dans `./RelationRow`.
import type { CRelType, CPersona, CMember, CGroup, CRelation, BlockPos } from "./types";
import {
  REL_W, CW, CH, BP, NC, BLOCK_W,
  mid, blockH, cardTL, cardCtr, bezierD, bezierMidPt, splitBezierHalves,
} from "./geometry";
import { RelationRow } from "./RelationRow";
import { useCanvasPanZoom } from "./useCanvasPanZoom";

/** Type de relation de repli, quand une relation pointe un type disparu. */
const FALLBACK_BASE = { id: "__fallback__", color: "#94a3b8", dash: "3 4", sort_index: 999 };

// ─── Component ────────────────────────────────────────────────────────────────

export type RelationsCanvasProps = {
  worldId: string;
  userId: string;
  canAdmin: boolean;
};

export function RelationsCanvas({ worldId, userId, canAdmin }: RelationsCanvasProps) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const fallback: CRelType = React.useMemo(() => ({ ...FALLBACK_BASE, name: t("unknown") }), [t]);
  const supabase = React.useMemo(() => createClient(), []);

  const [loading, setLoading] = React.useState(false);

  // Data
  const [personas, setPersonas] = React.useState<CPersona[]>([]);
  const [members, setMembers] = React.useState<CMember[]>([]);
  const [groups, setGroups] = React.useState<CGroup[]>([]);
  const [relTypes, setRelTypes] = React.useState<CRelType[]>([]);
  const [groupByPersona, setGroupByPersona] = React.useState<Map<string, string>>(new Map());
  const [relations, setRelations] = React.useState<CRelation[]>([]);
  const [blockPos, setBlockPos] = React.useState<Map<string, BlockPos>>(new Map());
  const [ownerId, setOwnerId] = React.useState<string | null>(null);

  // Connect flow
  const [connectMode, setConnectMode] = React.useState(false);
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [connectTarget, setConnectTarget] = React.useState<{ personaId: string; cx: number; cy: number } | null>(null);
  const [pendingDesc, setPendingDesc] = React.useState("");

  // Hover / aside
  const [hovRelId, setHovRelId] = React.useState<string | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = React.useState<string | null>(null);
  const [asideTab, setAsideTab] = React.useState<"out" | "in">("out");

  // Recherche (header) — filtre la liste mobile, atténue les cartes non
  // correspondantes sur le canevas desktop. Partagée entre les deux vues.
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  function closeSearch() {
    setSearch("");
    setSearchOpen(false);
  }

  // Autofocus au moment où le champ apparaît (l'icône seule n'a pas de focus).
  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Group picker
  const [openGroupPicker, setOpenGroupPicker] = React.useState<{ personaId: string; x: number; y: number } | null>(null);

  // Bloc en cours de déplacement. Déclaré ici, avant le hook du canevas qui
  // le consulte : plus bas, la référence tomberait dans sa zone morte.
  const drag = React.useRef<{ uid: string; mx0: number; my0: number; x0: number; y0: number } | null>(null);

  // Déplacement et zoom du canevas : molette, glisser, un doigt, pincement.
  // Tout est dans `./useCanvasPanZoom`, avec son arithmétique dans `./panZoom`.
  const {
    pan, setPan, scale, setScale, scaleRef, outerRef, canvasRef,
    onCanvasDown, onCanvasMove, onCanvasUp, onTouchStart, onTouchMove, onTouchEnd,
  } = useCanvasPanZoom(() => drag.current !== null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const [
        { data: pRows },
        { data: mRows },
        { data: wRow },
        { data: gRows },
        { data: aRows },
        { data: rRows },
        { data: posRows },
        { data: rtRows },
      ] = await Promise.all([
        supabase.from("personas").select("id, name, avatar_url, user_id").eq("world_id", worldId).eq("is_template", false).is("deleted_at", null),
        supabase.from("world_members").select("user_id").eq("world_id", worldId),
        supabase.from("worlds").select("owner_id").eq("id", worldId).single(),
        supabase.from("world_persona_groups").select("id, name, color, sort_index").eq("world_id", worldId).order("sort_index"),
        supabase.from("persona_group_assignments").select("persona_id, group_id").eq("world_id", worldId),
        supabase.from("persona_relations").select("id, from_persona_id, to_persona_id, type, label, description").eq("world_id", worldId),
        supabase.from("user_canvas_positions").select("user_id, x, y").eq("world_id", worldId),
        supabase.from("world_relation_types").select("id, name, color, dash, sort_index").eq("world_id", worldId).order("sort_index"),
      ]);

      const allPersonas = (pRows ?? []) as CPersona[];
      setPersonas(allPersonas);
      setGroups((gRows ?? []) as CGroup[]);
      setRelations((rRows ?? []) as CRelation[]);

      // Seed default relation types for this world if none exist
      let loadedTypes = (rtRows ?? []) as CRelType[];
      if (loadedTypes.length === 0 && canAdmin) {
        const defaults = [
          { world_id: worldId, name: t("defaultAlly"), color: "#22c55e", dash: "", sort_index: 0 },
          { world_id: worldId, name: t("defaultEnemy"), color: "#ef4444", dash: "", sort_index: 1 },
        ];
        const { data: seeded } = await supabase
          .from("world_relation_types")
          .insert(defaults)
          .select("id, name, color, dash, sort_index");
        loadedTypes = (seeded ?? []) as CRelType[];
      }
      setRelTypes(loadedTypes);

      type AssignRow = { persona_id: string; group_id: string };
      type MemberRow = { user_id: string };
      type ProfRow = { id: string; username: string | null; avatar_url: string | null };
      type PosRow = { user_id: string; x: number; y: number };

      const gbp = new Map<string, string>();
      for (const a of (aRows ?? []) as AssignRow[]) gbp.set(a.persona_id, a.group_id);
      setGroupByPersona(gbp);

      const ownerId = (wRow as { owner_id: string | null } | null)?.owner_id ?? null;
      setOwnerId(ownerId);
      const uids = new Set<string>(((mRows ?? []) as MemberRow[]).map((m) => m.user_id));
      if (ownerId) uids.add(ownerId);
      const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", Array.from(uids));
      setMembers(((profs ?? []) as ProfRow[]).map((p) => ({ user_id: p.id, username: p.username, avatar_url: p.avatar_url })));

      const saved = new Map<string, BlockPos>();
      for (const p of (posRows ?? []) as PosRow[]) saved.set(p.user_id, { x: p.x, y: p.y });

      const byUser = new Map<string, CPersona[]>();
      for (const p of allPersonas) {
        if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
        byUser.get(p.user_id)!.push(p);
      }

      let autoIdx = 0;
      const newPos = new Map<string, BlockPos>();
      for (const uid of uids) {
        if (!byUser.has(uid) || byUser.get(uid)!.length === 0) continue;
        if (saved.has(uid)) {
          newPos.set(uid, saved.get(uid)!);
        } else {
          const col = autoIdx % 3;
          const row = Math.floor(autoIdx / 3);
          newPos.set(uid, { x: 24 + col * (BLOCK_W + 56), y: 24 + row * 320 });
          autoIdx++;
        }
      }
      setBlockPos(newPos);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { setAsideTab("out"); }, [selectedPersonaId]);


  // ── Save block pos ────────────────────────────────────────────────────────

  async function savePos(uid: string, x: number, y: number) {
    const { error } = await supabase
      .from("user_canvas_positions")
      .upsert({ user_id: uid, world_id: worldId, x, y }, { onConflict: "user_id,world_id" });
    if (error) toast.error(t("savePositionError"), { description: error.message });
  }

  // ── Drag blocks ───────────────────────────────────────────────────────────


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
    setBlockPos((prev) => new Map(prev).set(uid, { x: nx, y: ny }));
    void savePos(uid, nx, ny);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const personasByUser = React.useMemo(() => {
    const m = new Map<string, CPersona[]>();
    for (const p of personas) {
      if (!m.has(p.user_id)) m.set(p.user_id, []);
      m.get(p.user_id)!.push(p);
    }
    return m;
  }, [personas]);

  const personaMap = React.useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const myPersonaIds = React.useMemo(() => new Set(personas.filter((p) => p.user_id === userId).map((p) => p.id)), [personas, userId]);
  const relTypeMap = React.useMemo(() => new Map(relTypes.map((t) => [t.id, t])), [relTypes]);

  const personaCenters = React.useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [uid, ps] of personasByUser) {
      const pos = blockPos.get(uid);
      if (!pos) continue;
      ps.forEach((p, i) => m.set(p.id, cardCtr(pos.x, pos.y, i)));
    }
    return m;
  }, [personasByUser, blockPos]);

  const groupColor = React.useMemo(() => {
    const m = new Map<string, string>();
    const gMap = new Map(groups.map((g) => [g.id, g.color]));
    for (const [pid, gid] of groupByPersona) {
      const c = gMap.get(gid);
      if (c) m.set(pid, c);
    }
    return m;
  }, [groupByPersona, groups]);

  const userList = React.useMemo(() =>
    members
      .filter((m) => (personasByUser.get(m.user_id)?.length ?? 0) > 0)
      .map((m) => ({ member: m, ps: personasByUser.get(m.user_id) ?? [] })),
    [members, personasByUser]
  );

  // ── Recherche ─────────────────────────────────────────────────────────────

  function ownerDisplayName(uid: string): string {
    const m = members.find((mm) => mm.user_id === uid);
    return m?.username ? `@${m.username}` : uid.slice(0, 8);
  }

  /** Un persona correspond si son nom OU le pseudo de son joueur matche. */
  function matchesSearch(p: CPersona): boolean {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (p.name.toLowerCase().includes(q)) return true;
    return ownerDisplayName(p.user_id).toLowerCase().includes(q);
  }

  /** Liste mobile filtrée : un pseudo qui matche garde tous ses personas,
   *  sinon seuls les personas dont le nom matche sont gardés. Groupes vides
   *  après filtrage retirés (plutôt qu'affichés avec un pseudo sans personas). */
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

  let maxW = 600, maxH = 400;
  for (const [uid, pos] of blockPos) {
    const n = personasByUser.get(uid)?.length ?? 0;
    maxW = Math.max(maxW, pos.x + BLOCK_W + 40);
    maxH = Math.max(maxH, pos.y + blockH(n) + 40);
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  function onCardClick(pid: string, canvasX: number, canvasY: number) {
    if (openGroupPicker) return;
    if (!connectMode) {
      setSelectedPersonaId((v) => v === pid ? null : pid);
      return;
    }
    if (!connecting) {
      if (!canAdmin && !myPersonaIds.has(pid)) return;
      setConnecting(pid);
      setConnectTarget(null);
    } else if (connecting === pid) {
      setConnecting(null);
      setConnectTarget(null);
    } else {
      setConnectTarget({ personaId: pid, cx: canvasX, cy: canvasY });
    }
  }

  function cancelConnect() {
    setConnecting(null);
    setConnectTarget(null);
    setPendingDesc("");
  }

  async function createRel(typeId: string) {
    if (!connecting || !connectTarget) return;
    const existing = relations.find(
      (r) => r.from_persona_id === connecting && r.to_persona_id === connectTarget.personaId,
    );
    const typeName = relTypeMap.get(typeId)?.name ?? typeId;
    if (existing) {
      const { error } = await supabase
        .from("persona_relations")
        .update({ type: typeId })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      else {
        setRelations((p) => p.map((r) => r.id === existing.id ? { ...r, type: typeId } : r));
        toast.success(t("typeChanged", { name: typeName }));
      }
    } else {
      const { data, error } = await supabase
        .from("persona_relations")
        .insert({
          world_id: worldId,
          from_persona_id: connecting,
          to_persona_id: connectTarget.personaId,
          type: typeId,
          description: pendingDesc.trim() || null,
          created_by: userId,
        })
        .select("id, from_persona_id, to_persona_id, type, label, description")
        .single();
      if (error) toast.error(error.message);
      else { setRelations((p) => [...p, data as CRelation]); toast.success(t("relCreated", { name: typeName })); }
    }
    cancelConnect();
  }

  async function deleteRel(id: string) {
    const { error } = await supabase.from("persona_relations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setRelations((p) => p.filter((r) => r.id !== id));
  }

  async function updateRelDesc(id: string, description: string) {
    const { error } = await supabase.from("persona_relations").update({ description: description || null }).eq("id", id);
    if (error) toast.error(error.message);
    else setRelations((p) => p.map((r) => r.id === id ? { ...r, description: description || null } : r));
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  async function assignGroup(personaId: string, gid: string | null) {
    setOpenGroupPicker(null);
    // L'erreur d'écriture n'était pas lue : un refus laissait l'affichage
    // montrer le nouveau groupe, qui disparaissait au rechargement suivant.
    const { error } = !gid
      ? await supabase.from("persona_group_assignments").delete().eq("persona_id", personaId).eq("world_id", worldId)
      : await supabase.from("persona_group_assignments").upsert({ persona_id: personaId, world_id: worldId, group_id: gid });

    if (error) {
      toast.error(tCommon("saveError"), { description: error.message });
      return;
    }

    setGroupByPersona((p) => {
      const n = new Map(p);
      if (gid) n.set(personaId, gid); else n.delete(personaId);
      return n;
    });
  }

  // ── Arrow pair detection ──────────────────────────────────────────────────

  const { arrowItems } = React.useMemo(() => {
    const pairMap = new Map<string, CRelation>();
    for (const r of relations) pairMap.set(`${r.from_persona_id}__${r.to_persona_id}`, r);

    const rendered = new Set<string>();
    const items: Array<
      | { kind: "single"; rel: CRelation }
      | { kind: "bidir"; rel: CRelation }
      | { kind: "split"; relAB: CRelation; relBA: CRelation }
    > = [];

    for (const rel of relations) {
      const key = `${rel.from_persona_id}__${rel.to_persona_id}`;
      const revKey = `${rel.to_persona_id}__${rel.from_persona_id}`;
      if (rendered.has(key)) continue;

      const reverse = pairMap.get(revKey);
      if (!reverse) {
        items.push({ kind: "single", rel });
      } else if (reverse.type === rel.type) {
        items.push({ kind: "bidir", rel });
        rendered.add(key);
        rendered.add(revKey);
      } else {
        items.push({ kind: "split", relAB: rel, relBA: reverse });
        rendered.add(key);
        rendered.add(revKey);
      }
    }
    return { arrowItems: items };
  }, [relations]);

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedPersona = selectedPersonaId ? personaMap.get(selectedPersonaId) : null;

  /**
   * Liste des relations d'un persona, groupées par type — partagée par le
   * panneau latéral desktop et la vue détail mobile (voir plus bas), pour ne
   * pas dupliquer le tri/regroupement.
   */
  function renderRelationsFor(persona: CPersona, tab: "out" | "in") {
    type RelItem = { rel: CRelation; direction: "→" | "←"; other: CPersona; canEdit: boolean };
    const outItems: RelItem[] = relations
      .filter((r) => r.from_persona_id === persona.id)
      .flatMap((r) => {
        const other = personaMap.get(r.to_persona_id);
        return other ? [{ rel: r, direction: "→" as const, other, canEdit: canAdmin || persona.user_id === userId }] : [];
      });
    const inItems: RelItem[] = relations
      .filter((r) => r.to_persona_id === persona.id)
      .flatMap((r) => {
        const other = personaMap.get(r.from_persona_id);
        return other ? [{ rel: r, direction: "←" as const, other, canEdit: canAdmin || other.user_id === userId }] : [];
      });
    const items = tab === "out" ? outItems : inItems;

    if (items.length === 0) return (
      <p className="py-8 text-center text-[12px] text-muted-foreground">{t("noRelations")}</p>
    );

    const grouped = new Map<string, RelItem[]>();
    for (const item of items) {
      const tid = item.rel.type;
      if (!grouped.has(tid)) grouped.set(tid, []);
      grouped.get(tid)!.push(item);
    }
    const sortedTypes = [...grouped.keys()].sort((a, b) => {
      const ia = relTypeMap.get(a)?.sort_index ?? 999;
      const ib = relTypeMap.get(b)?.sort_index ?? 999;
      return ia - ib;
    });

    return (
      <>
        {sortedTypes.map((tid) => {
          const meta = relTypeMap.get(tid) ?? fallback;
          return (
            <section key={tid} className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: meta.color }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                {meta.name}
              </h3>
              {grouped.get(tid)!.map(({ rel, direction, other, canEdit }) => (
                <RelationRow key={rel.id} rel={rel} other={other} direction={direction}
                  canEdit={canEdit}
                  onDelete={deleteRel} onUpdateDesc={updateRelDesc}
                  onHoverChange={setHovRelId} />
              ))}
            </section>
          );
        })}
      </>
    );
  }

  // `lg:bg-background` : fond plein seulement en desktop (le canevas en a
  // besoin) — en mobile, transparent comme Membres/Personas/Wiki, pour
  // laisser voir le fond ambiant du body.
  return (
    <div className="flex h-full w-full flex-col lg:bg-background">

      <WorldPanelHeader
        icon={<Network className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          <>
            {/* Recherche — filtre la liste mobile, atténue les cartes non
                correspondantes sur le canevas desktop (voir plus bas).
                Visible dans les deux vues, contrairement au bouton lien.
                Repliée en simple icône au repos ; un clic la transforme en
                champ de saisie, pour ne pas encombrer l'en-tête en continu. */}
            {searchOpen ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder={t("searchPlaceholder")}
                  className="w-28 rounded-md border border-border-soft bg-background py-1 pl-7 pr-6 text-xs outline-none focus:border-primary/50 sm:w-40"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={t("clearSearch")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t("searchPlaceholder")}
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            {/* Le mode lien pilote le flux « cliquer deux cartes » du canevas —
                n'a pas de sens sur mobile, qui a son propre flux de création
                (bouton + dans le détail d'un persona, voir plus bas). */}
            <div className="hidden items-center gap-1.5 lg:flex">
            {connecting && connectMode && (
              <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {t("clickAnotherCard")}
                <button onClick={cancelConnect} aria-label={tCommon("cancel")}><X className="h-3 w-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => { setConnectMode((v) => !v); cancelConnect(); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                connectMode
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary",
              )}
            >
              <Link2 className="h-3 w-3" />
              {connectMode ? t("linkModeActive") : t("createLink")}
            </button>
            </div>
          </>
        }
      />

      {/* ── Main area (desktop) : aside + canevas — illisible en petit écran,
          remplacé par la liste + détail mobile juste en dessous. ── */}
      <div className="hidden min-h-0 flex-1 lg:flex">

        {/* ── Persona aside ── */}
        {selectedPersona && (
          <div className="flex w-72 shrink-0 flex-col border-r border-border-soft bg-background">
            <div className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5">
              {selectedPersona.avatar_url
                ? <Image src={selectedPersona.avatar_url} alt={selectedPersona.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover shrink-0" />
                : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">{getInitials(selectedPersona.name)}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">{selectedPersona.name}</p>
                {(() => {
                  const owner = members.find((m) => m.user_id === selectedPersona.user_id);
                  return owner?.username ? <p className="text-[11px] text-muted-foreground">@{owner.username}</p> : null;
                })()}
              </div>
              <button onClick={() => setSelectedPersonaId(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={tCommon("close")}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs Relations / Reçues */}
            <div className="flex border-b border-border-soft">
              {(["out", "in"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAsideTab(tab)}
                  className={cn(
                    "flex-1 py-2 text-[11px] font-medium transition-colors",
                    asideTab === tab
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab === "out" ? t("tabOut") : t("tabIn")}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {renderRelationsFor(selectedPersona, asideTab)}
            </div>
          </div>
        )}

        {/* ── Canvas ── */}
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
          {/* Dot grid — fixed in viewport, unaffected by zoom/pan */}
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

              {/* User blocks */}
              {userList.map(({ member, ps }) => {
                const uid = member.user_id;
                const pos = blockPos.get(uid) ?? { x: 0, y: 0 };
                const bh = blockH(ps.length);
                const dName = member.username ? `@${member.username}` : uid.slice(0, 8);
                const letter = dName.replace(/^@/, "")[0]?.toUpperCase() ?? "?";

                return (
                  <div key={uid} className="absolute" style={{ left: pos.x, top: pos.y, width: BLOCK_W }}
                    onPointerDown={(e) => e.stopPropagation()}>
                    <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 backdrop-blur-sm" style={{ height: bh }}>
                      {/* Header — drag handle */}
                      <div
                        className={cn(
                          "flex h-[42px] select-none items-center gap-2 rounded-t-xl px-3",
                          (uid === userId || userId === ownerId) ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                        )}
                        onPointerDown={(e) => onHdrDown(e, uid)}
                        onPointerMove={(e) => onHdrMove(e, uid)}
                        onPointerUp={(e) => onHdrUp(e, uid)}
                        onPointerCancel={(e) => onHdrUp(e, uid)}
                      >
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-bold">
                          {member.avatar_url
                            ? <Image src={member.avatar_url} alt={dName} fill sizes="24px" className="object-cover" />
                            : letter}
                        </span>
                        <span className="truncate text-xs font-medium text-muted-foreground">{dName}</span>
                      </div>

                      {/* Cards grid */}
                      <div
                        className="grid gap-[6px]"
                        style={{ gridTemplateColumns: `repeat(${NC}, ${CW}px)`, padding: `${BP}px`, paddingTop: 0, paddingBottom: BP }}
                      >
                        {ps.map((p, i) => {
                          const gc = groupColor.get(p.id);
                          const isSrc = connecting === p.id;
                          const isSel = selectedPersonaId === p.id;
                          const dimmed = search.trim() !== "" && !matchesSearch(p);
                          return (
                            <div
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              style={{ width: CW, height: CH, borderColor: isSrc ? "#6366f1" : isSel ? "hsl(var(--primary))" : (gc ?? "transparent") }}
                              className={cn(
                                "relative cursor-pointer rounded-lg border-2 transition-all",
                                isSrc
                                  ? "scale-[1.04] ring-2 ring-indigo-500/40"
                                  : isSel
                                    ? "ring-1 ring-primary/30"
                                    : connectMode
                                      ? "hover:border-indigo-400 hover:ring-1 hover:ring-indigo-400/30"
                                      : "hover:opacity-90",
                                // Recherche active : les cartes qui ne correspondent
                                // ni par nom de persona ni par pseudo du joueur
                                // s'effacent, plutôt que d'être retirées (perdrait
                                // le repère spatial du canevas en position libre).
                                dimmed && "opacity-20 grayscale",
                              )}
                              onClick={() => {
                                const tl = cardTL(i);
                                onCardClick(p.id, pos.x + tl.x + CW / 2, pos.y + tl.y + CH / 2);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  const tl = cardTL(i);
                                  onCardClick(p.id, pos.x + tl.x + CW / 2, pos.y + tl.y + CH / 2);
                                }
                              }}
                            >
                              {/* Avatar + nom */}
                              <div className="absolute inset-0 overflow-hidden rounded-[6px]">
                                {p.avatar_url ? (
                                  <Image src={p.avatar_url} alt={p.name} fill sizes={`${CW}px`} className="object-cover" />
                                ) : (
                                  <div
                                    className="absolute inset-0 flex items-center justify-center text-xl font-bold"
                                    style={{ background: gc ? `${gc}33` : "var(--muted)", color: gc ?? "var(--muted-foreground)" }}
                                  >
                                    {getInitials(p.name)}
                                  </div>
                                )}
                                <div
                                  className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 pt-5"
                                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)" }}
                                >
                                  <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-white drop-shadow-sm">{p.name}</span>
                                </div>
                              </div>

                              {/* Group dot */}
                              {(canAdmin || p.user_id === userId) && groups.length > 0 && (
                                <div className="absolute right-1 top-0 z-20">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (openGroupPicker?.personaId === p.id) { setOpenGroupPicker(null); return; }
                                      const dotRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      const outerEl = outerRef.current;
                                      if (!outerEl) return;
                                      const cr = outerEl.getBoundingClientRect();
                                      setOpenGroupPicker({
                                        personaId: p.id,
                                        x: dotRect.left - cr.left + dotRect.width + 4,
                                        y: dotRect.top - cr.top,
                                      });
                                    }}
                                    className="h-2.5 w-2.5 rounded-full border border-background/60 shadow-sm"
                                    style={{ background: gc ?? "#94a3b8" }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* SVG arrows */}
              <svg className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }} width={maxW} height={maxH}>
                <defs>
                  {relTypes.map((t) => (
                    <marker key={t.id} id={mid(t.id)} markerWidth="10" markerHeight="14" refX="9" refY="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                      <path d="M1,1 L9,7 L1,13" fill="none" stroke={t.color} strokeWidth={REL_W} strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                  ))}
                </defs>

                {arrowItems.map((item) => {
                  if (item.kind === "single") {
                    const { rel } = item;
                    const a = personaCenters.get(rel.from_persona_id);
                    const b = personaCenters.get(rel.to_persona_id);
                    if (!a || !b) return null;
                    const meta = relTypeMap.get(rel.type) ?? fallback;
                    const d = bezierD(a.x, a.y, b.x, b.y);
                    const mp = bezierMidPt(a.x, a.y, b.x, b.y);
                    const hov = hovRelId === rel.id;
                    return (
                      <g key={rel.id}>
                        <path d={d} fill="none" stroke="transparent" strokeWidth="18"
                          className="pointer-events-auto cursor-pointer"
                          onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)} />
                        <path d={d} fill="none"
                          stroke={meta.color} strokeWidth={hov ? REL_W + 1 : REL_W}
                          strokeDasharray={meta.dash || undefined} opacity={hov ? 1 : 0.75}
                          markerEnd={`url(#${mid(meta.id)})`} />
                        {hov && (
                          <foreignObject x={mp.x - 44} y={mp.y - 14} width="88" height="28"
                            className="pointer-events-auto overflow-visible"
                            onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)}>
                            <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md">
                              <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.name}</span>
                              {(canAdmin || myPersonaIds.has(rel.from_persona_id)) && (
                                <button onClick={() => void deleteRel(rel.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
                                  <Trash2 style={{ width: 10, height: 10 }} />
                                </button>
                              )}
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  }

                  if (item.kind === "bidir") {
                    const { rel } = item;
                    const a = personaCenters.get(rel.from_persona_id);
                    const b = personaCenters.get(rel.to_persona_id);
                    if (!a || !b) return null;
                    const meta = relTypeMap.get(rel.type) ?? fallback;
                    const d = bezierD(a.x, a.y, b.x, b.y);
                    const mp = bezierMidPt(a.x, a.y, b.x, b.y);
                    const hov = hovRelId === rel.id;
                    return (
                      <g key={`bidir-${rel.id}`}>
                        <path d={d} fill="none" stroke="transparent" strokeWidth="18"
                          className="pointer-events-auto cursor-pointer"
                          onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)} />
                        <path d={d} fill="none"
                          stroke={meta.color} strokeWidth={hov ? REL_W + 1 : REL_W}
                          strokeDasharray={meta.dash || undefined} opacity={hov ? 1 : 0.75}
                          markerStart={`url(#${mid(meta.id)})`}
                          markerEnd={`url(#${mid(meta.id)})`} />
                        {hov && (
                          <foreignObject x={mp.x - 44} y={mp.y - 14} width="88" height="28"
                            className="pointer-events-auto overflow-visible"
                            onMouseEnter={() => setHovRelId(rel.id)} onMouseLeave={() => setHovRelId(null)}>
                            <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md">
                              <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.name} ↔</span>
                              {(canAdmin || myPersonaIds.has(rel.from_persona_id)) && (
                                <button onClick={() => void deleteRel(rel.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
                                  <Trash2 style={{ width: 10, height: 10 }} />
                                </button>
                              )}
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  }

                  if (item.kind === "split") {
                    const { relAB, relBA } = item;
                    const a = personaCenters.get(relAB.from_persona_id);
                    const b = personaCenters.get(relAB.to_persona_id);
                    if (!a || !b) return null;
                    const metaAB = relTypeMap.get(relAB.type) ?? fallback;
                    const metaBA = relTypeMap.get(relBA.type) ?? fallback;
                    const { dMidToA, dMidToB, mid: mp } = splitBezierHalves(a.x, a.y, b.x, b.y);
                    const fullD = bezierD(a.x, a.y, b.x, b.y);
                    const hovAB = hovRelId === relAB.id;
                    const hovBA = hovRelId === relBA.id;
                    const hov = hovAB || hovBA;
                    return (
                      <g key={`split-${relAB.id}`}>
                        <path d={fullD} fill="none" stroke="transparent" strokeWidth="18"
                          className="pointer-events-auto cursor-pointer"
                          onMouseEnter={() => setHovRelId(relAB.id)} onMouseLeave={() => setHovRelId(null)} />
                        <path d={dMidToB} fill="none"
                          stroke={metaAB.color} strokeWidth={hovAB ? REL_W + 1 : REL_W}
                          strokeDasharray={metaAB.dash || undefined} opacity={hov ? 1 : 0.75}
                          markerEnd={`url(#${mid(metaAB.id)})`} />
                        <path d={dMidToA} fill="none"
                          stroke={metaBA.color} strokeWidth={hovBA ? REL_W + 1 : REL_W}
                          strokeDasharray={metaBA.dash || undefined} opacity={hov ? 1 : 0.75}
                          markerEnd={`url(#${mid(metaBA.id)})`} />
                        {hov && (
                          <foreignObject x={mp.x - 52} y={mp.y - 14} width="104" height="28"
                            className="pointer-events-auto overflow-visible"
                            onMouseEnter={() => setHovRelId(relAB.id)} onMouseLeave={() => setHovRelId(null)}>
                            <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md">
                              <span className="text-[10px] font-semibold" style={{ color: metaAB.color }}>{metaAB.name}</span>
                              {(canAdmin || myPersonaIds.has(relAB.from_persona_id)) && (
                                <button onClick={() => void deleteRel(relAB.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
                                  <Trash2 style={{ width: 10, height: 10 }} />
                                </button>
                              )}
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] font-semibold" style={{ color: metaBA.color }}>{metaBA.name}</span>
                              {(canAdmin || myPersonaIds.has(relBA.from_persona_id)) && (
                                <button onClick={() => void deleteRel(relBA.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
                                  <Trash2 style={{ width: 10, height: 10 }} />
                                </button>
                              )}
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  }

                  return null;
                })}
              </svg>

              {/* Relation type picker */}
              {connectTarget && (
                <div
                  className="absolute z-40 flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 shadow-2xl"
                  style={{ left: connectTarget.cx + 8, top: connectTarget.cy - 90 }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="px-0.5 text-[10px] font-semibold text-muted-foreground">{t("relTypeLabel")}</p>
                  {relTypes.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {t("noTypesHint")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {relTypes.map((t) => (
                        <button key={t.id}
                          onClick={() => void createRel(t.id)}
                          className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium hover:bg-muted"
                          style={{ color: t.color }}>
                          <svg width="20" height="6">
                            <line x1="0" y1="3" x2="20" y2="3" stroke={t.color} strokeWidth={REL_W} strokeDasharray={t.dash || undefined} />
                          </svg>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={pendingDesc}
                    onChange={(e) => setPendingDesc(e.target.value)}
                    placeholder={t("descPlaceholder")}
                    rows={2}
                    className="resize-none rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onClick={cancelConnect}
                    className="rounded-lg px-2 py-1 text-center text-[10px] text-muted-foreground hover:bg-muted">
                    {tCommon("cancel")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Group picker — outside transform, positioned in outer viewport coords */}
          {openGroupPicker && (
            <>
              <div className="absolute inset-0" style={{ zIndex: 40 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setOpenGroupPicker(null)} />
              <div
                className="absolute flex min-w-[128px] flex-col gap-0.5 rounded-xl border border-border bg-background p-1.5 shadow-xl"
                style={{ left: openGroupPicker.x, top: openGroupPicker.y, zIndex: 50 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {groups.map((g) => (
                  <button key={g.id}
                    onClick={() => void assignGroup(openGroupPicker.personaId, g.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] hover:bg-muted text-left">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                    {g.name}
                  </button>
                ))}
                <button onClick={() => void assignGroup(openGroupPicker.personaId, null)}
                  className="rounded-lg px-2 py-1 text-[10px] text-left text-muted-foreground hover:bg-muted">
                  {t("noGroup")}
                </button>
              </div>
            </>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 z-50 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(4, s * 1.25))}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-sm shadow hover:bg-muted"
            >+</button>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.15, s / 1.25))}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-sm shadow hover:bg-muted"
            >−</button>
            <button
              type="button"
              onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-xs shadow hover:bg-muted text-muted-foreground"
              title={t("resetView")}
            >↺</button>
          </div>
        </div>
      </div>

      {/* ── Mobile : liste des personas + détail d'un persona sélectionné.
          Le canevas (position libre, courbes, pan/zoom) est illisible en
          petit écran — remplacé ici par une liste, groupée par joueur comme
          les blocs du canevas, où taper un persona ouvre ses relations
          (même contenu que le panneau latéral desktop, voir renderRelationsFor). ── */}
      <div data-testid="relations-mobile" className="flex min-h-0 flex-1 flex-col lg:hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{tCommon("loading")}</div>
        ) : selectedPersona ? (
          <>
            <div className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5">
              <button
                type="button"
                onClick={() => { setSelectedPersonaId(null); cancelConnect(); }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={tCommon("back")}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              {selectedPersona.avatar_url
                ? <Image src={selectedPersona.avatar_url} alt={selectedPersona.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover shrink-0" />
                : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">{getInitials(selectedPersona.name)}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">{selectedPersona.name}</p>
                {(() => {
                  const owner = members.find((m) => m.user_id === selectedPersona.user_id);
                  return owner?.username ? <p className="text-[11px] text-muted-foreground">@{owner.username}</p> : null;
                })()}
              </div>
              {(canAdmin || selectedPersona.user_id === userId) && !connecting && (
                <button
                  type="button"
                  onClick={() => setConnecting(selectedPersona.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={t("addRelation")}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            {connecting === selectedPersona.id ? (
              connectTarget ? (
                // Étape 2/2 : type de relation — même flux que le sélecteur du
                // canevas (createRel/cancelConnect), sans positionnement cx/cy.
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("relTypeLabel")}</p>
                  {relTypes.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t("noTypesHint")}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {relTypes.map((rt) => (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => void createRel(rt.id)}
                          className="flex flex-col items-center gap-1 rounded-xl border border-border-soft px-2 py-2 text-[10px] font-medium hover:bg-muted"
                          style={{ color: rt.color }}
                        >
                          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={rt.color} strokeWidth={REL_W} strokeDasharray={rt.dash || undefined} /></svg>
                          {rt.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={pendingDesc}
                    onChange={(e) => setPendingDesc(e.target.value)}
                    placeholder={t("descPlaceholder")}
                    rows={3}
                    className="resize-none rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button type="button" onClick={cancelConnect} className="rounded-lg px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted">
                    {tCommon("cancel")}
                  </button>
                </div>
              ) : (
                // Étape 1/2 : choisir la personne visée
                <div className="flex flex-1 flex-col overflow-y-auto">
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("pickTarget")}</p>
                  {personas.filter((p) => p.id !== selectedPersona.id).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setConnectTarget({ personaId: p.id, cx: 0, cy: 0 })}
                      className="flex items-center gap-3 border-b border-border-soft px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      {p.avatar_url
                        ? <Image src={p.avatar_url} alt={p.name} width={28} height={28} className="h-7 w-7 rounded-full object-cover shrink-0" />
                        : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">{getInitials(p.name)}</div>
                      }
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                    </button>
                  ))}
                  <button type="button" onClick={cancelConnect} className="px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
                    {tCommon("cancel")}
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="flex border-b border-border-soft">
                  {(["out", "in"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setAsideTab(tab)}
                      className={cn(
                        "flex-1 py-2 text-[11px] font-medium transition-colors",
                        asideTab === tab
                          ? "border-b-2 border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab === "out" ? t("tabOut") : t("tabIn")}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {renderRelationsFor(selectedPersona, asideTab)}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {filteredUserList.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground/60">
                {search.trim() ? t("noSearchResults") : t("noPersonas")}
              </p>
            ) : (
              filteredUserList.map(({ member, ps }) => {
                const dName = member.username ? `@${member.username}` : member.user_id.slice(0, 8);
                const letter = dName.replace(/^@/, "")[0]?.toUpperCase() ?? "?";
                return (
                  <div key={member.user_id}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-soft bg-background px-3 py-2">
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-bold">
                        {member.avatar_url
                          ? <Image src={member.avatar_url} alt={dName} fill sizes="20px" className="object-cover" />
                          : letter}
                      </span>
                      <span className="truncate text-xs font-medium text-muted-foreground">{dName}</span>
                    </div>
                    {ps.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPersonaId(p.id)}
                        className="flex w-full items-center gap-3 border-b border-border-soft px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        {p.avatar_url
                          ? <Image src={p.avatar_url} alt={p.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover shrink-0" />
                          : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">{getInitials(p.name)}</div>
                        }
                        <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Footer legend ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border-soft px-4 py-2">
        {relTypes.map((t) => (
          <span key={t.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <svg width="22" height="8">
              <line x1="0" y1="4" x2="22" y2="4" stroke={t.color} strokeWidth={REL_W} strokeDasharray={t.dash || undefined} />
            </svg>
            {t.name}
          </span>
        ))}
        {/* Instructions du canevas (clics souris) — sans objet sur mobile,
            qui a son propre flux (voir la liste + détail juste au-dessus). */}
        <span className="ml-auto hidden text-[11px] text-muted-foreground/60 lg:inline">
          {connectMode ? t("footerHintConnect") : t("footerHintView")}
        </span>
      </div>
    </div>
  );
}
