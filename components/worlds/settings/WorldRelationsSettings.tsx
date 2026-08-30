"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

type RelationGroup = { id: string; name: string; color: string; sort_index: number };
type RelationType = { id: string; name: string; color: string; dash: string; sort_index: number };

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

// Rendu inline (pas de portail) pour éviter que Radix Dialog interprète le
// pointerdown sur le canvas HSV comme un clic hors du dialog.
function ColorPickerButton({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const tCommon = useTranslations("common");
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
        aria-label={tCommon("chooseColor")}
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-lg border border-border bg-popover p-3 shadow-md">
          <HsvColorPicker color={color} onChange={onChange} presets={[]} />
        </div>
      )}
    </div>
  );
}

export function WorldRelationsSettings({ worldId }: { worldId: string }) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const dashOptions = getDashOptions(t);
  const supabase = React.useMemo(() => createClient(), []);

  const [groups, setGroups] = React.useState<RelationGroup[] | null>(null);
  const [relTypes, setRelTypes] = React.useState<RelationType[]>([]);

  React.useEffect(() => {
    void (async () => {
      const [{ data: gRows }, { data: rtRows }] = await Promise.all([
        supabase.from("world_persona_groups").select("id, name, color, sort_index").eq("world_id", worldId).order("sort_index"),
        supabase.from("world_relation_types").select("id, name, color, dash, sort_index").eq("world_id", worldId).order("sort_index"),
      ]);
      setGroups((gRows ?? []) as RelationGroup[]);
      setRelTypes((rtRows ?? []) as RelationType[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

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
    if (!gName.trim() || !groups) return;
    const { data, error } = await supabase
      .from("world_persona_groups")
      .insert({ world_id: worldId, name: gName.trim(), color: gColor, sort_index: groups.length })
      .select("id, name, color, sort_index")
      .single();
    if (error) { toast.error(error.message); return; }
    setGroups([...groups, data as RelationGroup]);
    setGName("");
  }

  async function deleteGroup(id: string) {
    const { error } = await supabase.from("world_persona_groups").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setGroups((prev) => prev?.filter((g) => g.id !== id) ?? null);
  }

  function startEditG(g: RelationGroup) {
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
    setGroups((prev) => prev?.map((g) =>
      g.id === editGId ? { ...g, name: editGName.trim(), color: editGColor } : g
    ) ?? null);
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
    setRelTypes([...relTypes, data as RelationType]);
    setRtName("");
    setRtColor("#22c55e");
    setRtDash("");
  }

  async function deleteRelType(id: string) {
    const { error } = await supabase.from("world_relation_types").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRelTypes((prev) => prev.filter((t) => t.id !== id));
  }

  function startEditRt(t: RelationType) {
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
    setRelTypes((prev) => prev.map((t) =>
      t.id === editRtId ? { ...t, name: editRtName.trim(), color: editRtColor, dash: editRtDash } : t
    ));
    setEditRtId(null);
  }

  if (groups === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
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
                <button onClick={() => setEditGId(null)} className="text-muted-foreground hover:text-foreground" aria-label={tCommon("cancel")}><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <div key={g.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="flex-1 text-[13px] font-medium">{g.name}</span>
                <button onClick={() => startEditG(g)} className="text-[11px] text-muted-foreground hover:text-foreground">{tCommon("edit")}</button>
                <button onClick={() => void deleteGroup(g.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
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
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => void addGroup()} aria-label={t("addGroup")}>
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
                <button onClick={() => setEditRtId(null)} className="text-muted-foreground hover:text-foreground" aria-label={tCommon("cancel")}><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <div key={rt.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
                <svg width="24" height="8" className="shrink-0">
                  <line x1="0" y1="4" x2="24" y2="4" stroke={rt.color} strokeWidth={1.5} strokeDasharray={rt.dash || undefined} />
                </svg>
                <span className="flex-1 text-[13px] font-medium">{rt.name}</span>
                <button onClick={() => startEditRt(rt)} className="text-[11px] text-muted-foreground hover:text-foreground">{tCommon("edit")}</button>
                <button onClick={() => void deleteRelType(rt.id)} className="text-muted-foreground hover:text-destructive" aria-label={tCommon("delete")}>
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
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => void addRelType()} aria-label={t("addRelType")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
