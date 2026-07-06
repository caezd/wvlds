"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Link2, Network, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

// ─── Types ────────────────────────────────────────────────────────────────────

type CRelType = { id: string; name: string; color: string; dash: string; sort_index: number };
type CPersona = { id: string; name: string; avatar_url: string | null; user_id: string };
type CMember = { user_id: string; username: string | null; avatar_url: string | null };
type CGroup = { id: string; name: string; color: string; sort_index: number };
type CRelation = { id: string; from_persona_id: string; to_persona_id: string; type: string; label: string | null; description: string | null };
type BlockPos = { x: number; y: number };

type DashOption = { label: string; value: string };
function getDashOptions(t: ReturnType<typeof useTranslations<"relations">>): DashOption[] {
  return [
    { label: t("dash.solid"), value: "" },
    { label: t("dash.dashed"), value: "5 3" },
    { label: t("dash.dotted"), value: "2 3" },
    { label: t("dash.long"), value: "8 4" },
    { label: t("dash.mixed"), value: "8 3 2 3" },
  ];
}

const REL_W = 1.5;
const FALLBACK_BASE = { id: "__fallback__", color: "#94a3b8", dash: "3 4", sort_index: 999 };

// SVG marker id — uuid peut contenir des tirets, on les retire
function mid(id: string) { return `arr-${id.replaceAll("-", "")}`; }

// ─── Layout ───────────────────────────────────────────────────────────────────

const CW = 88; const CH = 88; const CG = 6; const BP = 10; const HH = 42; const NC = 2;
const BB = 2; // épaisseur de la bordure du bloc (border-2)
const BLOCK_W = NC * CW + (NC - 1) * CG + BP * 2;

function blockH(n: number) {
  const rows = Math.max(1, Math.ceil(n / NC));
  return HH + BP + rows * CH + (rows > 1 ? (rows - 1) * CG : 0) + BP;
}

// La grille a paddingTop:0 et le bloc a border-2 → y = BB+HH (pas de BP en haut)
function cardTL(i: number) {
  return { x: BB + BP + (i % NC) * (CW + CG), y: BB + HH + Math.floor(i / NC) * (CH + CG) };
}

function cardCtr(bx: number, by: number, i: number) {
  const p = cardTL(i);
  return { x: bx + p.x + CW / 2, y: by + p.y + CH / 2 };
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ─── Arrow math ───────────────────────────────────────────────────────────────

function edgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { x: cx, y: cy - h / 2, nx: 0, ny: -1 };
  const hw = w / 2, hh = h / 2;
  const sx = hw / Math.abs(dx), sy = hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  const onV = s === sx;
  return { x: cx + dx * s, y: cy + dy * s, nx: onV ? Math.sign(dx) : 0, ny: onV ? 0 : Math.sign(dy) };
}

function bezierD(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  return `M ${A.x} ${A.y} C ${A.x + A.nx * ofs} ${A.y + A.ny * ofs} ${B.x + B.nx * ofs} ${B.y + B.ny * ofs} ${B.x} ${B.y}`;
}

function bezierMidPt(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  const cx1 = A.x + A.nx * ofs, cy1 = A.y + A.ny * ofs;
  const cx2 = B.x + B.nx * ofs, cy2 = B.y + B.ny * ofs;
  return {
    x: 0.125 * A.x + 0.375 * cx1 + 0.375 * cx2 + 0.125 * B.x,
    y: 0.125 * A.y + 0.375 * cy1 + 0.375 * cy2 + 0.125 * B.y,
  };
}

// Découpe un bezier cubique en deux demi-chemins à t=0.5 (De Casteljau)
function splitBezierHalves(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  const cx1 = A.x + A.nx * ofs, cy1 = A.y + A.ny * ofs;
  const cx2 = B.x + B.nx * ofs, cy2 = B.y + B.ny * ofs;
  const m1x = (A.x + cx1) / 2, m1y = (A.y + cy1) / 2;
  const m2x = (cx1 + cx2) / 2, m2y = (cy1 + cy2) / 2;
  const m3x = (cx2 + B.x) / 2, m3y = (cy2 + B.y) / 2;
  const m4x = (m1x + m2x) / 2, m4y = (m1y + m2y) / 2;
  const m5x = (m2x + m3x) / 2, m5y = (m2y + m3y) / 2;
  const mx = (m4x + m5x) / 2, my = (m4y + m5y) / 2;
  return {
    dMidToA: `M ${mx} ${my} C ${m4x} ${m4y} ${m1x} ${m1y} ${A.x} ${A.y}`,
    dMidToB: `M ${mx} ${my} C ${m5x} ${m5y} ${m3x} ${m3y} ${B.x} ${B.y}`,
    mid: { x: mx, y: my },
  };
}

// ─── RelationRow ──────────────────────────────────────────────────────────────

function RelationRow({
  rel, other, direction, canEdit, onDelete, onUpdateDesc, onHoverChange,
}: {
  rel: CRelation;
  other: CPersona;
  direction: "→" | "←";
  canEdit: boolean;
  onDelete: (id: string) => void;
  onUpdateDesc: (id: string, desc: string) => void;
  onHoverChange?: (id: string | null) => void;
}) {
  const t = useTranslations("relations");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(rel.description ?? "");

  function save() {
    setEditing(false);
    if (draft !== (rel.description ?? "")) onUpdateDesc(rel.id, draft);
  }

  return (
    <div
      className="group/row rounded-xl border border-border bg-card p-2.5 space-y-1.5"
      onMouseEnter={() => onHoverChange?.(rel.id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground font-mono">{direction}</span>
        {other.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={other.avatar_url} alt={other.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
          : <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">{initials(other.name)}</div>
        }
        <span className="truncate text-[12px] font-medium flex-1">{other.name}</span>
        {canEdit && (
          <button onClick={() => onDelete(rel.id)} className="shrink-0 opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(rel.description ?? ""); setEditing(false); } }}
          placeholder="Description (markdown)…"
          className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          rows={3}
        />
      ) : (
        <div
          onClick={() => canEdit && setEditing(true)}
          className={cn(
            "text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed min-h-[20px]",
            canEdit && "cursor-text hover:text-foreground transition-colors",
            !rel.description && "italic opacity-50",
          )}
        >
          {rel.description || (canEdit ? t("addDescription") : "")}
        </div>
      )}
    </div>
  );
}

// ─── ColorPickerButton ───────────────────────────────────────────────────────
// Rendu inline (pas de portail) pour éviter que Radix Dialog interprète le
// pointerdown sur le canvas HSV comme un clic hors du dialog.

function ColorPickerButton({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 shrink-0 rounded-md border border-border shadow-sm transition-shadow hover:ring-2 hover:ring-ring"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-lg border border-border bg-popover p-3 shadow-md">
          <HsvColorPicker color={color} onChange={onChange} presets={[]} />
        </div>
      )}
    </div>
  );
}

// ─── CanvasSettingsDialog ─────────────────────────────────────────────────────

function CanvasSettingsDialog({
  worldId,
  groups,
  relTypes,
  onGroupsChange,
  onRelTypesChange,
}: {
  worldId: string;
  groups: CGroup[];
  relTypes: CRelType[];
  onGroupsChange: (gs: CGroup[]) => void;
  onRelTypesChange: (ts: CRelType[]) => void;
}) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const dashOptions = getDashOptions(t);
  const supabase = React.useMemo(() => createClient(), []);

  // Groups form
  const [gName, setGName] = React.useState("");
  const [gColor, setGColor] = React.useState("#6366f1");

  // Editing group
  const [editGId, setEditGId] = React.useState<string | null>(null);
  const [editGName, setEditGName] = React.useState("");
  const [editGColor, setEditGColor] = React.useState("");

  // Relation type form
  const [rtName, setRtName] = React.useState("");
  const [rtColor, setRtColor] = React.useState("#22c55e");
  const [rtDash, setRtDash] = React.useState("");

  // Editing relation type
  const [editRtId, setEditRtId] = React.useState<string | null>(null);
  const [editRtName, setEditRtName] = React.useState("");
  const [editRtColor, setEditRtColor] = React.useState("");
  const [editRtDash, setEditRtDash] = React.useState("");

  // ── Groups ──────────────────────────────────────────────────────────────────

  async function addGroup() {
    if (!gName.trim()) return;
    const { data, error } = await supabase
      .from("world_persona_groups")
      .insert({ world_id: worldId, name: gName.trim(), color: gColor, sort_index: groups.length })
      .select("id, name, color, sort_index")
      .single();
    if (error) { toast.error(error.message); return; }
    onGroupsChange([...groups, data as CGroup]);
    setGName("");
  }

  async function deleteGroup(id: string) {
    const { error } = await supabase.from("world_persona_groups").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onGroupsChange(groups.filter((g) => g.id !== id));
  }

  function startEditG(g: CGroup) {
    setEditGId(g.id);
    setEditGName(g.name);
    setEditGColor(g.color);
  }

  async function saveEditG() {
    if (!editGId) return;
    const { error } = await supabase
      .from("world_persona_groups")
      .update({ name: editGName.trim(), color: editGColor })
      .eq("id", editGId);
    if (error) { toast.error(error.message); return; }
    onGroupsChange(groups.map((g) =>
      g.id === editGId ? { ...g, name: editGName.trim(), color: editGColor } : g
    ));
    setEditGId(null);
  }

  // ── Relation types ───────────────────────────────────────────────────────────

  async function addRelType() {
    if (!rtName.trim()) return;
    const { data, error } = await supabase
      .from("world_relation_types")
      .insert({ world_id: worldId, name: rtName.trim(), color: rtColor, dash: rtDash, sort_index: relTypes.length })
      .select("id, name, color, dash, sort_index")
      .single();
    if (error) { toast.error(error.message); return; }
    onRelTypesChange([...relTypes, data as CRelType]);
    setRtName("");
    setRtColor("#22c55e");
    setRtDash("");
  }

  async function deleteRelType(id: string) {
    const { error } = await supabase.from("world_relation_types").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onRelTypesChange(relTypes.filter((t) => t.id !== id));
  }

  function startEditRt(t: CRelType) {
    setEditRtId(t.id);
    setEditRtName(t.name);
    setEditRtColor(t.color);
    setEditRtDash(t.dash);
  }

  async function saveEditRt() {
    if (!editRtId) return;
    const { error } = await supabase
      .from("world_relation_types")
      .update({ name: editRtName.trim(), color: editRtColor, dash: editRtDash })
      .eq("id", editRtId);
    if (error) { toast.error(error.message); return; }
    onRelTypesChange(relTypes.map((t) =>
      t.id === editRtId ? { ...t, name: editRtName.trim(), color: editRtColor, dash: editRtDash } : t
    ));
    setEditRtId(null);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Settings className="h-3 w-3" />
          {tCommon("settings")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="groups">
          <TabsList className="w-full">
            <TabsTrigger value="groups" className="flex-1">{t("groups")}</TabsTrigger>
            <TabsTrigger value="reltypes" className="flex-1">{t("relTypes")}</TabsTrigger>
          </TabsList>

          {/* ── Groupes ── */}
          <TabsContent value="groups" className="mt-4 space-y-3">
            <div className="space-y-1.5">
              {groups.length === 0 && (
                <p className="text-center text-[12px] text-muted-foreground py-4">{t("noGroupsDefined")}</p>
              )}
              {groups.map((g) =>
                editGId === g.id ? (
                  <div key={g.id} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2">
                    <ColorPickerButton color={editGColor} onChange={setEditGColor} />
                    <Input value={editGName} onChange={(e) => setEditGName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEditG(); }}
                      className="h-8 flex-1 text-[12px]" autoFocus />
                    <button onClick={() => void saveEditG()} className="text-xs font-medium text-primary hover:underline">OK</button>
                    <button onClick={() => setEditGId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <div key={g.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                    <span className="flex-1 text-[13px] font-medium">{g.name}</span>
                    <button onClick={() => startEditG(g)} className="text-[11px] text-muted-foreground hover:text-foreground">{tCommon("edit")}</button>
                    <button onClick={() => void deleteGroup(g.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border-soft pt-3">
              <ColorPickerButton color={gColor} onChange={setGColor} />
              <Input value={gName} onChange={(e) => setGName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addGroup(); }}
                placeholder={t("groupNamePlaceholder")} className="h-8 flex-1 text-sm" />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => void addGroup()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TabsContent>

          {/* ── Types de relation ── */}
          <TabsContent value="reltypes" className="mt-4 space-y-3">
            <div className="space-y-1.5">
              {relTypes.length === 0 && (
                <p className="text-center text-[12px] text-muted-foreground py-4">{t("noTypesDefined")}</p>
              )}
              {relTypes.map((rt) =>
                editRtId === rt.id ? (
                  <div key={rt.id} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2">
                    <ColorPickerButton color={editRtColor} onChange={setEditRtColor} />
                    <Input value={editRtName} onChange={(e) => setEditRtName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEditRt(); }}
                      className="h-7 flex-1 text-[12px]" />
                    <select value={editRtDash} onChange={(e) => setEditRtDash(e.target.value)}
                      className="h-7 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring">
                      {dashOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button onClick={() => void saveEditRt()} className="text-xs font-medium text-primary hover:underline">OK</button>
                    <button onClick={() => setEditRtId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <div key={rt.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
                    <svg width="24" height="8" className="shrink-0">
                      <line x1="0" y1="4" x2="24" y2="4" stroke={rt.color} strokeWidth={REL_W} strokeDasharray={rt.dash || undefined} />
                    </svg>
                    <span className="flex-1 text-[13px] font-medium">{rt.name}</span>
                    <button onClick={() => startEditRt(rt)} className="text-[11px] text-muted-foreground hover:text-foreground">{tCommon("edit")}</button>
                    <button onClick={() => void deleteRelType(rt.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border-soft pt-3">
              <ColorPickerButton color={rtColor} onChange={setRtColor} />
              <Input value={rtName} onChange={(e) => setRtName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addRelType(); }}
                placeholder={t("typeNamePlaceholder")} className="h-8 flex-1 text-sm" />
              <select value={rtDash} onChange={(e) => setRtDash(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring">
                {dashOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => void addRelType()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export type RelationsCanvasProps = {
  worldId: string;
  userId: string;
  canAdmin: boolean;
  onClose: () => void;
};

export function RelationsCanvas({ worldId, userId, canAdmin, onClose }: RelationsCanvasProps) {
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

  // Group picker
  const [openGroupPicker, setOpenGroupPicker] = React.useState<{ personaId: string; x: number; y: number } | null>(null);

  // Canvas pan / zoom
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [scale, setScale] = React.useState(1);
  const panRef = React.useRef({ x: 0, y: 0 });
  const scaleRef = React.useRef(1);
  panRef.current = pan;
  scaleRef.current = scale;

  const outerRef = React.useRef<HTMLDivElement>(null); // viewport fixe
  const canvasRef = React.useRef<HTMLDivElement>(null); // div transformée

  // drag pan souris
  const panDrag = React.useRef<{ startX: number; startY: number; panX0: number; panY0: number } | null>(null);
  // pinch touch
  const pinchRef = React.useRef<{ dist0: number; scale0: number; panX0: number; panY0: number; midX0: number; midY0: number } | null>(null);
  const touchRef = React.useRef<{ startX: number; startY: number; panX0: number; panY0: number } | null>(null);

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

  // ── Canvas pan / zoom ─────────────────────────────────────────────────────

  // Molette : zoom vers le curseur (listener non-passif obligatoire)
  React.useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = Math.max(0.15, Math.min(4, scaleRef.current * factor));
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = next / scaleRef.current;
      setScale(next);
      setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan souris : pointerdown sur le fond du canvas (blocs stoppent la propagation)
  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 || drag.current) return;
    panDrag.current = { startX: e.clientX, startY: e.clientY, panX0: panRef.current.x, panY0: panRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  }
  function onCanvasMove(e: React.PointerEvent) {
    if (!panDrag.current) return;
    setPan({ x: panDrag.current.panX0 + e.clientX - panDrag.current.startX, y: panDrag.current.panY0 + e.clientY - panDrag.current.startY });
  }
  function onCanvasUp(e: React.PointerEvent) {
    panDrag.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
  }

  // Touch : 1 doigt = pan, 2 doigts = pinch
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX0: panRef.current.x, panY0: panRef.current.y };
      pinchRef.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchRef.current = {
        dist0: Math.sqrt(dx * dx + dy * dy),
        scale0: scaleRef.current,
        panX0: panRef.current.x, panY0: panRef.current.y,
        midX0: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY0: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      touchRef.current = null;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && touchRef.current) {
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const dy = e.touches[0].clientY - touchRef.current.startY;
      setPan({ x: touchRef.current.panX0 + dx, y: touchRef.current.panY0 + dy });
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const next = Math.max(0.15, Math.min(4, pinchRef.current.scale0 * (dist / pinchRef.current.dist0)));
      const rect = outerRef.current!.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const mid0X = pinchRef.current.midX0 - rect.left;
      const mid0Y = pinchRef.current.midY0 - rect.top;
      const ratio = next / pinchRef.current.scale0;
      setScale(next);
      setPan({ x: midX - (mid0X - pinchRef.current.panX0) * ratio, y: midY - (mid0Y - pinchRef.current.panY0) * ratio });
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) { touchRef.current = null; pinchRef.current = null; }
    else if (e.touches.length === 1) {
      pinchRef.current = null;
      touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX0: panRef.current.x, panY0: panRef.current.y };
    }
  }

  // ── Save block pos ────────────────────────────────────────────────────────

  async function savePos(uid: string, x: number, y: number) {
    const { error } = await supabase
      .from("user_canvas_positions")
      .upsert({ user_id: uid, world_id: worldId, x, y }, { onConflict: "user_id,world_id" });
    if (error) toast.error(t("savePositionError"), { description: error.message });
  }

  // ── Drag blocks ───────────────────────────────────────────────────────────

  const drag = React.useRef<{ uid: string; mx0: number; my0: number; x0: number; y0: number } | null>(null);

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
    if (!gid) {
      await supabase.from("persona_group_assignments").delete().eq("persona_id", personaId).eq("world_id", worldId);
      setGroupByPersona((p) => { const n = new Map(p); n.delete(personaId); return n; });
    } else {
      await supabase.from("persona_group_assignments").upsert({ persona_id: personaId, world_id: worldId, group_id: gid });
      setGroupByPersona((p) => new Map(p).set(personaId, gid));
    }
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

  return (
    <div className="flex h-full w-full flex-col bg-background">

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
        <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("title")}</span>

        <button
          type="button"
          onClick={() => { setConnectMode((v) => !v); cancelConnect(); }}
          className={cn(
            "ml-2 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            connectMode
              ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
              : "border-border-soft bg-background text-muted-foreground hover:bg-secondary",
          )}
        >
          <Link2 className="h-3 w-3" />
          {connectMode ? t("linkModeActive") : t("createLink")}
        </button>

        {connecting && connectMode && (
          <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {t("clickAnotherCard")}
            <button onClick={cancelConnect}><X className="h-3 w-3" /></button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canAdmin && (
            <CanvasSettingsDialog
              worldId={worldId}
              groups={groups}
              relTypes={relTypes}
              onGroupsChange={setGroups}
              onRelTypesChange={setRelTypes}
            />
          )}
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={tCommon("close")}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* ── Main area: aside + canvas ── */}
      <div className="flex min-h-0 flex-1">

        {/* ── Persona aside ── */}
        {selectedPersona && (
          <div className="flex w-72 shrink-0 flex-col border-r border-border-soft bg-background">
            <div className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5">
              {selectedPersona.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={selectedPersona.avatar_url} alt={selectedPersona.name} className="h-8 w-8 rounded-full object-cover shrink-0" />
                : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">{initials(selectedPersona.name)}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">{selectedPersona.name}</p>
                {(() => {
                  const owner = members.find((m) => m.user_id === selectedPersona.user_id);
                  return owner?.username ? <p className="text-[11px] text-muted-foreground">@{owner.username}</p> : null;
                })()}
              </div>
              <button onClick={() => setSelectedPersonaId(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
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
              {(() => {
                type RelItem = { rel: CRelation; direction: "→" | "←"; other: CPersona; canEdit: boolean };
                const outItems: RelItem[] = relations
                  .filter((r) => r.from_persona_id === selectedPersona.id)
                  .flatMap((r) => {
                    const other = personaMap.get(r.to_persona_id);
                    return other ? [{ rel: r, direction: "→" as const, other, canEdit: canAdmin || selectedPersona.user_id === userId }] : [];
                  });
                const inItems: RelItem[] = relations
                  .filter((r) => r.to_persona_id === selectedPersona.id)
                  .flatMap((r) => {
                    const other = personaMap.get(r.from_persona_id);
                    return other ? [{ rel: r, direction: "←" as const, other, canEdit: canAdmin || other.user_id === userId }] : [];
                  });
                const items = asideTab === "out" ? outItems : inItems;

                if (items.length === 0) return (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">{t("noRelations")}</p>
                );

                // Grouper par type, dans l'ordre de relTypes
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
              })()}
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
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-bold">
                          {member.avatar_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={member.avatar_url} alt={dName} className="h-full w-full object-cover" />
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
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.avatar_url} alt={p.name} className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                  <div
                                    className="absolute inset-0 flex items-center justify-center text-xl font-bold"
                                    style={{ background: gc ? `${gc}33` : "var(--muted)", color: gc ?? "var(--muted-foreground)" }}
                                  >
                                    {initials(p.name)}
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
                                <button onClick={() => void deleteRel(rel.id)} className="text-muted-foreground hover:text-destructive">
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
                                <button onClick={() => void deleteRel(rel.id)} className="text-muted-foreground hover:text-destructive">
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
                                <button onClick={() => void deleteRel(relAB.id)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 style={{ width: 10, height: 10 }} />
                                </button>
                              )}
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] font-semibold" style={{ color: metaBA.color }}>{metaBA.name}</span>
                              {(canAdmin || myPersonaIds.has(relBA.from_persona_id)) && (
                                <button onClick={() => void deleteRel(relBA.id)} className="text-muted-foreground hover:text-destructive">
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
        <span className="ml-auto text-[11px] text-muted-foreground/60">
          {connectMode ? t("footerHintConnect") : t("footerHintView")}
        </span>
      </div>
    </div>
  );
}
