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
import type { Area } from "react-easy-crop";

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
import { ImageCropPicker, getCroppedImg } from "@/components/ui/image-crop-picker";
import { Loader2, Settings, ChevronDown, Image as ImageIcon, FileUp } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

type MapPinOption = { id: string; title: string; color: string };

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
    messages_count?: number;
    timeline_date?: WorldTimelineDate | null;
    map_pin_id?: string | null;
  };
  worldTimelineConfig?: WorldTimelineConfig | null;
  worldId?: string | null;
};

export default function ChatroomSettingsSheet({ canEdit, chatroom, worldTimelineConfig, worldId }: Props) {
  const t = useTranslations("chatrooms");
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [open, setOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState<"icon" | "banner" | null>(null);
  const [bannerCropSrc, setBannerCropSrc] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [timelineDate, setTimelineDate] = React.useState<WorldTimelineDate | null>(chatroom.timeline_date ?? null);
  const [savingTimeline, setSavingTimeline] = React.useState(false);
  const { world_map } = useFeatureFlags();
  const [mapPins, setMapPins] = React.useState<MapPinOption[]>([]);
  const [mapPinId, setMapPinId] = React.useState<string | null>(chatroom.map_pin_id ?? null);
  const [savingPin, setSavingPin] = React.useState(false);

  const iconInputRef = React.useRef<HTMLInputElement | null>(null);
  const bannerInputRef = React.useRef<HTMLInputElement | null>(null);

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
      if (world_map && worldId) {
        void supabase
          .from("world_map_pins")
          .select("id, title, color")
          .eq("world_id", worldId)
          .order("sort_index")
          .then(({ data }) => setMapPins((data ?? []) as MapPinOption[]));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatroom.id]);

  const iconUrl = form.watch("icon_url");
  const bannerUrl = form.watch("banner_url");

  const canShow = canEdit && (chatroom.messages_count ?? 1) > 0;

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

  function handleFile(file: File | undefined, kind: "icon" | "banner") {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Seules les images sont acceptées."); return; }
    if (kind === "banner") {
      setBannerCropSrc(URL.createObjectURL(file));
    } else {
      void uploadFile(file, "icon");
    }
  }

  async function onBannerCropConfirm(pixels: Area) {
    if (!bannerCropSrc) return;
    try {
      const blob = await getCroppedImg(bannerCropSrc, pixels);
      URL.revokeObjectURL(bannerCropSrc);
      setBannerCropSrc(null);
      await uploadFile(new File([blob], "banner.jpg", { type: "image/jpeg" }), "banner");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du recadrage.");
    }
  }

  function cancelBannerCrop() {
    if (bannerCropSrc) URL.revokeObjectURL(bannerCropSrc);
    setBannerCropSrc(null);
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
    if (error) toast.error(error.message);
    else router.refresh();
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
      {canShow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Paramètres de la salle"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>Paramètres</TooltipContent>
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
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full",
                  !iconUrl && "bg-card-400",
                )}>
                  {uploading === "icon" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={iconUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </span>

                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { void handleFile(e.target.files?.[0], "icon"); e.target.value = ""; }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Changer l&apos;icône <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => iconInputRef.current?.click()}>
                      Téléverser une image…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!iconUrl}
                      onClick={() => {
                        form.setValue("icon_url", "", { shouldDirty: true });
                        void persistField("icon_url", "");
                      }}
                    >
                      Retirer l&apos;icône
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

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
                          void persistTimeline({ year: worldTimelineConfig.current_year, month: worldTimelineConfig.current_month });
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
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
                          mapPinId === pin.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border-soft bg-background text-foreground hover:bg-secondary"
                        }`}
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
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { handleFile(e.target.files?.[0], "banner"); e.target.value = ""; }}
                    />

                    {bannerCropSrc ? (
                      <ImageCropPicker
                        src={bannerCropSrc}
                        aspect={16 / 7}
                        uploading={uploading === "banner"}
                        onConfirm={onBannerCropConfirm}
                        onCancel={cancelBannerCrop}
                      />
                    ) : (
                      <>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => bannerInputRef.current?.click()}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") bannerInputRef.current?.click(); }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0], "banner"); }}
                          className={cn(
                            "relative grid min-h-36 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-border transition-colors hover:border-muted-foreground/40",
                            bannerUrl && "border-solid",
                          )}
                        >
                          {bannerUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={bannerUrl} alt="Bannière" className="absolute inset-0 h-full w-full object-cover" />
                              <div className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                                <span className="text-xs font-medium text-white">{t("settingsBannerHint")}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-6 text-center">
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-400">
                                {uploading === "banner"
                                  ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  : <FileUp className="h-4 w-4 text-muted-foreground" />
                                }
                              </span>
                              <p className="text-xs font-medium">
                                Glisser-déposer ou{" "}
                                <span className="text-blue-400">{t("settingsBrowse")}</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">Taille max 5 Mo</p>
                            </div>
                          )}
                        </div>
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
                      </>
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
