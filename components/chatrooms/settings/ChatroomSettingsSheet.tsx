"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { Loader2, Settings, ChevronDown } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";

type MapPinOption = { id: string; title: string; color: string };
type CategoryOption = { id: string; title: string; banner_url: string | null; icon_url: string | null };

const schema = z.object({
  title: z.string().trim().min(1, "Nom requis").max(80),
  icon_url: z.string().url().optional().or(z.literal("")),
  banner_url: z.string().url().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function truthyOrNull(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

type Props = {
  canEdit?: boolean;
  chatroom: {
    id: string;
    title: string | null;
    banner_url: string | null;
    icon_url: string | null;
    timeline_date?: WorldTimelineDate | null;
    map_pin_id?: string | null;
    category_id?: string | null;
  };
  worldTimelineConfig?: WorldTimelineConfig | null;
  worldId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export default function ChatroomSettingsSheet({
  canEdit,
  chatroom,
  worldTimelineConfig,
  worldId,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(v: boolean) {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  }
  const [uploading, setUploading] = React.useState<"icon" | "banner" | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [timelineDate, setTimelineDate] = React.useState<WorldTimelineDate | null>(chatroom.timeline_date ?? null);
  const [savingTimeline, setSavingTimeline] = React.useState(false);
  const { world_map } = useFeatureFlags();
  const [mapPins, setMapPins] = React.useState<MapPinOption[]>([]);
  const [mapPinId, setMapPinId] = React.useState<string | null>(chatroom.map_pin_id ?? null);
  const [savingPin, setSavingPin] = React.useState(false);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | null>(chatroom.category_id ?? null);
  const [savingCategory, setSavingCategory] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: chatroom.title ?? "",
      icon_url: chatroom.icon_url ?? "",
      banner_url: chatroom.banner_url ?? "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        title: chatroom.title ?? "",
        icon_url: chatroom.icon_url ?? "",
        banner_url: chatroom.banner_url ?? "",
      });
      setTimelineDate(chatroom.timeline_date ?? null);
      setMapPinId(chatroom.map_pin_id ?? null);
      setCategoryId(chatroom.category_id ?? null);
      if (world_map && worldId) {
        void supabase
          .from("world_map_pins")
          .select("id, title, color")
          .eq("world_id", worldId)
          .order("sort_index")
          .then(({ data }: { data: MapPinOption[] | null }) => setMapPins(data ?? []));
      }
      if (worldId) {
        void (async () => {
          const { data, error } = await supabase
            .from("chatroom_categories")
            .select("id, title, banner_url, icon_url")
            .eq("world_id", worldId)
            .order("position");
          if (error) toast.error(error.message);
          setCategories((data as CategoryOption[] | null) ?? []);
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatroom.id]);

  const iconUrl = form.watch("icon_url");
  const bannerUrl = form.watch("banner_url");

  // ---------- upload ----------

  async function uploadToChatrooms(file: File, kind: "icon" | "banner") {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(t("settingsErrorNotConnected"));
    if (file.size > 5 * 1024 * 1024) throw new Error(t("settingsErrorTooLarge"));

    const converted = await toWebP(file);
    const path = `chatroom-${chatroom.id}/${kind}.webp`;

    const { error } = await supabase.storage
      .from("chatrooms")
      .upload(path, converted, { upsert: true, contentType: converted.type });
    if (error) throw error;

    return supabase.storage.from("chatrooms").getPublicUrl(path).data.publicUrl;
  }

  async function uploadFile(file: File, kind: "icon" | "banner") {
    setUploading(kind);
    try {
      const url = await uploadToChatrooms(file, kind);
      const field = kind === "icon" ? "icon_url" : "banner_url";
      form.setValue(field, url, { shouldDirty: true, shouldValidate: true });
      await persistField(field, url);
      toast.success("Image enregistrée.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Téléversement impossible.");
    } finally {
      setUploading(null);
    }
  }

  async function onIconConfirm(blob: Blob) {
    await uploadFile(new File([blob], "icon.jpg", { type: blob.type || "image/jpeg" }), "icon");
  }

  async function onBannerConfirm(blob: Blob) {
    await uploadFile(new File([blob], "banner.jpg", { type: blob.type || "image/jpeg" }), "banner");
  }

  // ---------- persist ----------

  async function persistField(
    field: "title" | "icon_url" | "banner_url",
    value: string | null,
  ) {
    const clean = field === "title" ? (value?.trim() || null) : truthyOrNull(value);
    const { error } = await supabase
      .from("chatrooms")
      .update({ [field]: clean })
      .eq("id", chatroom.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Modification enregistrée.");
    router.refresh();
  }

  // ---------- lieu ----------

  async function persistMapPin(pinId: string | null) {
    setSavingPin(true);
    const { error } = await supabase
      .from("chatrooms")
      .update({ map_pin_id: pinId })
      .eq("id", chatroom.id);
    setSavingPin(false);
    if (error) { toast.error(error.message); return; }
    setMapPinId(pinId);
    toast.success("Modification enregistrée.");
    router.refresh();
  }

  // ---------- catégorie ----------

  async function persistCategory(catId: string | null) {
    setSavingCategory(true);
    const { error } = await supabase
      .from("chatrooms")
      .update({ category_id: catId })
      .eq("id", chatroom.id);
    setSavingCategory(false);
    if (error) { toast.error(error.message); return; }
    setCategoryId(catId);
    toast.success("Modification enregistrée.");
    router.refresh();
  }

  // ---------- timeline ----------

  async function persistTimeline(date: WorldTimelineDate | null) {
    setSavingTimeline(true);
    const { error } = await supabase
      .from("chatrooms")
      .update({ timeline_date: date })
      .eq("id", chatroom.id);
    setSavingTimeline(false);
    if (error) { toast.error(error.message); return; }
    setTimelineDate(date);
    toast.success("Modification enregistrée.");
    router.refresh();
  }

  // ---------- delete ----------

  async function handleDelete() {
    setDeleting(true);
    try {
      await supabase.storage.from("chatrooms").remove([
        `chatroom-${chatroom.id}/icon.webp`,
        `chatroom-${chatroom.id}/banner.webp`,
      ]);
      const { error } = await supabase.from("chatrooms").delete().eq("id", chatroom.id);
      if (error) throw error;
      toast.success("Salle supprimée.");
      setOpen(false);
      router.back();
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger && canEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={tCommon("settings")}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>{tCommon("settings")}</TooltipContent>
        </Tooltip>
      )}

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border-soft px-6 py-4">
          <SheetTitle>{t("settingsTitle")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-6 overflow-y-auto p-6">

              {/* Icône */}
              <FormField
                control={form.control}
                name="icon_url"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("settingsIcon")}</FormLabel>
                    {iconUrl ? (
                      <div className="flex items-center gap-2">
                        <ImagePickerCropField
                          aspect={1}
                          uploading={uploading === "icon"}
                          previewSrc={iconUrl}
                          previewClassName="h-12 w-12 shrink-0 rounded-full"
                          changeLabel="Changer"
                          onConfirm={onIconConfirm}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploading === "icon"}
                          onClick={() => {
                            form.setValue("icon_url", "", { shouldDirty: true });
                            void persistField("icon_url", "");
                          }}
                        >
                          Retirer
                        </Button>
                      </div>
                    ) : (
                      <ImagePickerCropField
                        aspect={1}
                        uploading={uploading === "icon"}
                        onConfirm={onIconConfirm}
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nom */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("settingsNamePlaceholder")}
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          const v = e.target.value.trim();
                          if (v.length >= 1) void persistField("title", v);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Chronologie */}
              {worldTimelineConfig && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsTimeline")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Associe cette conversation à une date fictive.
                      </p>
                    </div>
                    <Switch
                      checked={timelineDate !== null}
                      disabled={savingTimeline}
                      onCheckedChange={(v) => {
                        if (v) {
                          void persistTimeline({ year: worldTimelineConfig.current_year, month: worldTimelineConfig.current_month, day: null });
                        } else {
                          void persistTimeline(null);
                        }
                      }}
                    />
                  </div>

                  {timelineDate !== null && (
                    <div className="ml-1 space-y-3 rounded-xl border border-border-soft bg-muted/20 p-3">
                      {/* Année */}
                      <div className="flex items-center gap-3">
                        <label className="w-20 shrink-0 text-xs text-muted-foreground">
                          {worldTimelineConfig.year_label || "Année"}
                          {worldTimelineConfig.era_name && (
                            <span className="ml-1 text-muted-foreground/60">{worldTimelineConfig.era_name}</span>
                          )}
                        </label>
                        <Input
                          type="number"
                          className="h-8 w-28 text-sm"
                          value={timelineDate.year}
                          onChange={(e) => setTimelineDate({ ...timelineDate, year: Number(e.target.value) })}
                          onBlur={(e) => {
                            const y = parseInt(e.target.value, 10);
                            if (!isNaN(y)) void persistTimeline({ ...timelineDate, year: y });
                          }}
                        />
                      </div>

                      {/* Mois */}
                      {worldTimelineConfig.month_names.length > 0 && (
                        <div className="flex items-center gap-3">
                          <label className="w-20 shrink-0 text-xs text-muted-foreground">{t("settingsMonth")}</label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 min-w-28 justify-between text-sm" disabled={savingTimeline}>
                                {timelineDate.month !== null && worldTimelineConfig.month_names[timelineDate.month]
                                  ? worldTimelineConfig.month_names[timelineDate.month]
                                  : <span className="text-muted-foreground">—</span>}
                                <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => void persistTimeline({ ...timelineDate, month: null, day: null })}>
                                <span className="text-muted-foreground">{t("settingsNoMonth")}</span>
                              </DropdownMenuItem>
                              {worldTimelineConfig.month_names.map((name, idx) => (
                                <DropdownMenuItem key={idx} onClick={() => void persistTimeline({ ...timelineDate, month: idx })}>
                                  {name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}

                      {/* Jour */}
                      {timelineDate.month !== null && (
                        <div className="flex items-center gap-3">
                          <label className="w-20 shrink-0 text-xs text-muted-foreground">{t("settingsDay")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            placeholder="—"
                            className="h-8 w-28 text-sm"
                            value={timelineDate.day ?? ""}
                            onChange={(e) => setTimelineDate({ ...timelineDate, day: e.target.value ? Number(e.target.value) : null })}
                            onBlur={(e) => {
                              const raw = parseInt(e.target.value, 10);
                              const day = isNaN(raw) ? null : Math.min(31, Math.max(1, raw));
                              void persistTimeline({ ...timelineDate, day });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Catégorie */}
              {categories.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsCategory")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Regroupe cette conversation avec d&apos;autres dans la sidebar.
                      </p>
                    </div>
                    {categoryId && (
                      <button
                        type="button"
                        disabled={savingCategory}
                        onClick={() => void persistCategory(null)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        {t("settingsCategoryNone")}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={savingCategory}
                        onClick={() => void persistCategory(cat.id === categoryId ? null : cat.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                          categoryId === cat.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border-soft bg-background text-foreground hover:bg-secondary",
                        )}
                      >
                        <CategoryAvatar
                          title={cat.title}
                          bannerUrl={cat.banner_url}
                          iconUrl={cat.icon_url}
                          letterClassName="text-[9px]"
                          className="h-5 w-5 rounded-md"
                        />
                        {cat.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lieu */}
              {world_map && mapPins.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsLocation")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Associe cette conversation à un lieu de la carte.
                      </p>
                    </div>
                    {mapPinId && (
                      <button
                        type="button"
                        disabled={savingPin}
                        onClick={() => void persistMapPin(null)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {mapPins.map(pin => (
                      <button
                        key={pin.id}
                        type="button"
                        disabled={savingPin}
                        onClick={() => void persistMapPin(pin.id === mapPinId ? null : pin.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                          mapPinId === pin.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border-soft bg-background text-foreground hover:bg-secondary",
                        )}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
                        {pin.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bannière */}
              <FormField
                control={form.control}
                name="banner_url"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("settingsBanner")}</FormLabel>
                    <ImagePickerCropField
                      aspect={16 / 7}
                      uploading={uploading === "banner"}
                      previewSrc={bannerUrl || null}
                      previewClassName="aspect-[16/7] w-full rounded-2xl"
                      changeLabel={t("settingsBannerHint")}
                      onConfirm={onBannerConfirm}
                    />
                    {bannerUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue("banner_url", "", { shouldDirty: true });
                          void persistField("banner_url", "");
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Retirer la bannière
                      </button>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter className="border-t border-border-soft px-6 py-3 flex-row justify-start">
              <DeleteConfirmDialog
                description="La salle et tous ses messages seront supprimés définitivement."
                onConfirm={() => void handleDelete()}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    className="inline-flex text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Supprimer la salle
                  </Button>
                }
              />
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
