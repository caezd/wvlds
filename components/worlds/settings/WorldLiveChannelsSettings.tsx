"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Hash, Loader2, Lock, Plus, Trash2, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { TABLE } from "@/lib/constants";
import { reorderRows } from "@/lib/reorder";
import { useLiveChannels } from "@/hooks/useLiveChannels";
import {
  PERSONA_GROUP_COLUMNS,
  groupChoices,
  normalizeGroupRow,
  resolvePersonaGroups,
  type PersonaGroupRow,
} from "@/lib/personaGroups";
import {
  LIVE_CHANNEL_COLUMNS,
  LIVE_CHANNEL_NAME_MAX,
  sortChannels,
  type LiveChannel,
} from "@/lib/worldLiveChannels";
import { ColorPickerButton } from "./ColorPickerButton";
import { SETTINGS_ROW, SettingsSection } from "./FeatureLayout";

/** Une ligne de la liste : bordée, sur le fond des cartes (comme les relations). */
const ROW = SETTINGS_ROW;
const BARE_INPUT = "h-8 min-w-32 flex-1 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none focus-visible:ring-0";
const SWATCH = "size-6 rounded-md border-0 shadow-none";
/** Couleur d'une salle qui n'en a pas encore : un gris neutre. */
const NO_COLOR = "#94a3b8";
/** La valeur du menu de visibilité pour « tous les membres » (pas de groupe). */
const EVERYONE = "";

type GroupChoice = { id: string; name: string; color: string | null };

/**
 * Les salles de la chatbox d'un monde (migration 238), dans Paramètres ›
 * Fonctions › Chatbox. La salle principale est toujours là, en tête ; les
 * autres se créent, se renomment, prennent une couleur et une icône (« # »
 * sans icône), se réordonnent et se suppriment — avec leurs messages.
 * Une salle peut être réservée à un groupe de personas (migration 243) : la
 * base la cache alors aux membres sans persona dans ce groupe ou ses
 * sous-groupes.
 * Le fil de chaque salon de jeu, lui, n'est pas une salle : il s'ouvre de
 * lui-même dans la chatbox de ce salon.
 */
export function WorldLiveChannelsSettings({ worldId }: { worldId: string }) {
  const t = useTranslations("worlds.settings.liveChannels");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const { channels, setChannels } = useLiveChannels(worldId);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState<string | null>(null);
  const [newGroup, setNewGroup] = React.useState<string | null>(null);
  // Les groupes de personas du monde, sous leur chemin, dans l'ordre de l'arbre.
  const [groups, setGroups] = React.useState<GroupChoice[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<LiveChannel | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void supabase
      .from("world_persona_groups")
      .select(PERSONA_GROUP_COLUMNS)
      .eq("world_id", worldId)
      .order("sort_index")
      .then(({ data }: { data: unknown }) => {
        if (cancelled) return;
        setGroups(groupChoices(resolvePersonaGroups(((data ?? []) as PersonaGroupRow[]).map(normalizeGroupRow))));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  // La couleur s'enregistre un instant après le dernier réglage (sélecteur HSV).
  const colorTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => {
    const timers = colorTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  function edit(id: string, patch: Partial<LiveChannel>) {
    setChannels((prev) => prev?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? null);
  }

  async function save(id: string, patch: Partial<Pick<LiveChannel, "name" | "color" | "icon" | "group_id">>) {
    const { error } = await supabase.from(TABLE.WORLD_LIVE_CHANNELS).update(patch).eq("id", id);
    if (error) {
      console.error("[WorldLiveChannelsSettings] enregistrement", error);
      toast.error(tCommon("saveError"));
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name || !channels || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from(TABLE.WORLD_LIVE_CHANNELS)
      .insert({
        world_id: worldId,
        name,
        color: newColor,
        sort_index: channels.length ? Math.max(...channels.map((c) => c.sort_index)) + 1 : 0,
        group_id: newGroup,
      })
      .select(LIVE_CHANNEL_COLUMNS)
      .single();
    setAdding(false);
    if (error || !data) {
      console.error("[WorldLiveChannelsSettings] ajout", error);
      toast.error(tCommon("saveError"));
      return;
    }
    const created = data as LiveChannel;
    setChannels((prev) => sortChannels([...(prev ?? []).filter((c) => c.id !== created.id), created]));
    setNewName("");
    setNewColor(null);
    setNewGroup(null);
  }

  async function move(index: number, delta: -1 | 1) {
    if (!channels) return;
    const target = index + delta;
    if (target < 0 || target >= channels.length) return;
    const before = channels;
    const next = [...channels];
    [next[index], next[target]] = [next[target], next[index]];
    const ranked = next.map((c, i) => ({ ...c, sort_index: i }));
    setChannels(ranked);
    const { error } = await reorderRows(
      supabase,
      "reorder_world_live_channels",
      ranked.map((c) => ({ id: c.id, sort_index: c.sort_index })),
    );
    if (error) {
      setChannels(before);
      toast.error(tCommon("saveError"));
    }
  }

  async function confirmDelete() {
    const channel = toDelete;
    setToDelete(null);
    if (!channel) return;
    const { error } = await supabase.from(TABLE.WORLD_LIVE_CHANNELS).delete().eq("id", channel.id);
    if (error) {
      toast.error(tCommon("saveError"));
      return;
    }
    setChannels((prev) => prev?.filter((c) => c.id !== channel.id) ?? null);
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("help")}
      help={t("more")}
      count={channels ? channels.length + 1 : undefined}
    >
      {channels === null ? (
        <div className="flex justify-center py-4 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <ul className="space-y-2" aria-label={t("title")} data-testid="live-channels">
          {/* La salle principale : toujours là, ni renommée ni supprimée. */}
          <li className={ROW} data-testid="live-channel-main">
            <span className="flex size-6 items-center justify-center text-muted-foreground">
              <Hash className="size-4" aria-hidden />
            </span>
            <span className="min-w-32 flex-1 px-1.5 text-sm font-medium">{t("main")}</span>
            <span className="flex items-center gap-1 pr-2 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              {t("mainHint")}
            </span>
          </li>
          {channels.map((c, i) => (
            <li key={c.id} className={ROW} data-channel-id={c.id}>
              <ColorPickerButton
                color={c.color ?? NO_COLOR}
                alpha={false}
                className={SWATCH}
                onChange={(color) => {
                  edit(c.id, { color });
                  const timers = colorTimers.current;
                  clearTimeout(timers.get(c.id));
                  timers.set(c.id, setTimeout(() => { timers.delete(c.id); void save(c.id, { color }); }, 400));
                }}
              />
              <LucideIconPicker
                value={c.icon ?? ""}
                accent={c.color ?? undefined}
                onChange={(icon) => {
                  edit(c.id, { icon });
                  void save(c.id, { icon });
                }}
                trigger={
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                    aria-label={t("icon", { name: c.name })}
                    style={c.color ? { color: c.color } : undefined}
                    data-testid="live-channel-icon"
                  >
                    {c.icon ? <LazyLucideIcon name={c.icon} className="size-4" /> : <Hash className="size-4" />}
                  </button>
                }
              />
              <Input
                value={c.name}
                maxLength={LIVE_CHANNEL_NAME_MAX}
                aria-label={t("name")}
                // Assez étroit pour laisser la place au choix du groupe, sur la même ligne.
                className={cn(BARE_INPUT, "min-w-20")}
                style={c.color ? { color: c.color } : undefined}
                onChange={(e) => edit(c.id, { name: e.target.value })}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name) void save(c.id, { name });
                }}
              />
              {groups.length > 0 && (
                <GroupPicker
                  value={c.group_id}
                  groups={groups}
                  label={t("visibility", { name: c.name })}
                  onChange={(group_id) => {
                    edit(c.id, { group_id });
                    void save(c.id, { group_id });
                  }}
                />
              )}
              <div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={tCommon("moveUp")}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === channels.length - 1}
                  onClick={() => void move(i, 1)}
                  aria-label={tCommon("moveDown")}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  onClick={() => setToDelete(c)}
                  aria-label={t("delete", { name: c.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-dashed border-border py-1.5 pl-3 pr-1.5">
        <ColorPickerButton color={newColor ?? NO_COLOR} alpha={false} onChange={setNewColor} className={SWATCH} />
        <Input
          value={newName}
          maxLength={LIVE_CHANNEL_NAME_MAX}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder={t("namePlaceholder")}
          aria-label={t("namePlaceholder")}
          className={cn(BARE_INPUT, "font-normal")}
        />
        {groups.length > 0 && (
          <GroupPicker value={newGroup} groups={groups} label={t("newVisibility")} onChange={setNewGroup} className="max-w-48" />
        )}
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={!newName.trim() || adding || !channels} onClick={() => void add()} aria-label={t("add")}>
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" aria-hidden />}
          {tCommon("add")}
        </Button>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: toDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>{tCommon("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

/**
 * Qui voit une salle : tous les membres, ou les personas d'un groupe (et de
 * ses sous-groupes). Les gérants du monde la voient toujours.
 */
function GroupPicker({
  value,
  groups,
  label,
  onChange,
  className,
}: {
  value: string | null;
  groups: GroupChoice[];
  label: string;
  onChange: (groupId: string | null) => void;
  /** Sur une salle existante, étroit : il partage la ligne avec le nom et les boutons. */
  className?: string;
}) {
  const t = useTranslations("worlds.settings.liveChannels");
  const current = value ? groups.find((g) => g.id === value) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 max-w-32 shrink-0 gap-1.5 px-2 text-xs font-normal text-muted-foreground", className)}
          aria-label={label}
          title={label}
        >
          {current ? (
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: current.color ?? NO_COLOR }} aria-hidden />
          ) : (
            <Users className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{current ? current.name : t("everyone")}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup value={value ?? EVERYONE} onValueChange={(v) => onChange(v === EVERYONE ? null : v)}>
          <DropdownMenuRadioItem value={EVERYONE}>{t("everyone")}</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("restrictTo")}</DropdownMenuLabel>
          {groups.map((g) => (
            <DropdownMenuRadioItem key={g.id} value={g.id} className="gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color ?? NO_COLOR }} aria-hidden />
              <span className="truncate">{g.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
