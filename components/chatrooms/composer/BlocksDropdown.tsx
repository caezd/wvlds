"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Component, Dices, Pipette, ImagePlus, Eye, Lock, Sword, Heart,
  Square, Anchor, CalendarDays, MapPin, MessageCircle, MessageSquareText, Check,
  AlertTriangle, Vote, type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { Button } from "../../ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerContent,
    DrawerTitle,
    DrawerDescription,
    DrawerTrigger,
    DrawerHeader,
} from "@/components/ui/drawer";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { formatTimelineLabel } from "@/lib/worldTimeline";

// Les sept dialogues de blocs ne sont montés qu'à la demande (clic sur l'outil
// correspondant), mais l'import statique les embarquait dans le bundle de tout
// salon. `CalloutDialog` tirait en plus un second `react-markdown` complet
// (+ remark-gfm, remark-breaks) via CalloutBlock.
const DiceDialog = dynamic(() => import("../blocks/DiceDialog").then((m) => m.DiceDialog), { ssr: false });
const NarrativeBlockDialog = dynamic(() => import("../blocks/NarrativeBlockDialog").then((m) => m.NarrativeBlockDialog), { ssr: false });
const NpcDialog = dynamic(() => import("../blocks/NpcBlock").then((m) => m.NpcDialog), { ssr: false });
const HpDialog = dynamic(() => import("../blocks/HpBlock").then((m) => m.HpDialog), { ssr: false });
const CalloutDialog = dynamic(() => import("../blocks/CalloutBlock").then((m) => m.CalloutDialog), { ssr: false });
const AnchorDialog = dynamic(() => import("../blocks/AnchorDialog").then((m) => m.AnchorDialog), { ssr: false });
const ChoiceDialog = dynamic(() => import("../blocks/ChoiceBlock").then((m) => m.ChoiceDialog), { ssr: false });

/** Point d'intérêt d'une carte de monde, proposé à l'ancrage d'un message. */
export type MapPinOption = { id: string; title: string; color: string };

// ──────────────────────────────────────────────────────────────────────────
// Menu des blocs du composeur : dés, PNJ, points de vie, encadré, ancre,
// choix, bulle, note privée, avertissements de contenu, date, lieu.
//
// Sorti de `ChatroomComposer`, où il occupait 692 des 1 591 lignes. Les deux
// moitiés ne se touchaient que par ce composant — le menu n'utilise rien du
// composeur, et le composeur ne connaît du menu que son point d'entrée.
//
// Les sept dialogues de blocs suivent le menu : ils n'étaient montés que
// d'ici, et leur chargement à la demande reste inchangé.
// ──────────────────────────────────────────────────────────────────────────

type ComposerMenuItem = {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    checked?: boolean;
    disabled?: boolean;
    onActivate: () => void;
};

// ── Rangée de menu (icône + titre + description) partagée par les deux
// sections (blocs / options). Le survol/focus met à jour l'aperçu à droite.
function ComposerMenuRow({
    item,
    isActive,
    onHover,
}: {
    item: ComposerMenuItem;
    isActive: boolean;
    onHover: () => void;
}) {
    const Icon = item.icon;
    return (
        <button
            type="button"
            disabled={item.disabled}
            onMouseEnter={onHover}
            onFocus={onHover}
            onClick={item.onActivate}
            className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                isActive ? "bg-muted" : "hover:bg-muted/60",
                item.checked && "ring-1 ring-inset ring-primary/30 bg-primary/5",
            )}
        >
            <span
                className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    item.checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
            >
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{item.title}</span>
                    {item.checked && <Check className="h-3 w-3 shrink-0 text-primary" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
            </span>
        </button>
    );
}

// ── Rangée-accordéon (drawer mobile) : pas de survol au toucher, donc la
// sélection d'un item déplie directement l'aperçu + la description sous son
// propre bloc (bordure englobant tout l'ensemble) au lieu du panneau latéral
// desktop. Une confirmation explicite déclenche l'action.
function ComposerMenuAccordionRow({
    item,
    isOpen,
    onToggle,
    onConfirm,
    renderPreview,
    confirmLabel,
}: {
    item: ComposerMenuItem;
    isOpen: boolean;
    onToggle: () => void;
    onConfirm: () => void;
    renderPreview: (id: string) => React.ReactNode;
    confirmLabel: string;
}) {
    const Icon = item.icon;
    return (
        <div
            className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                isOpen ? "border-primary/40 bg-primary/5" : "border-border-soft",
            )}
        >
            <button
                type="button"
                disabled={item.disabled}
                onClick={onToggle}
                className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <span
                    className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        item.checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                >
                    <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{item.title}</span>
                        {item.checked && <Check className="h-3 w-3 shrink-0 text-primary" />}
                    </span>
                    {!isOpen && (
                        <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                    )}
                </span>
            </button>
            {isOpen && (
                <div className="flex flex-col gap-3 border-t border-border-soft px-3 py-3">
                    <div className="flex items-center justify-center">{renderPreview(item.id)}</div>
                    <p className="text-xs leading-snug text-muted-foreground">{item.description}</p>
                    <Button size="sm" onClick={onConfirm}>{confirmLabel}</Button>
                </div>
            )}
        </div>
    );
}

export function BlocksDropdown({
    variant = "dropdown",
    onSend,
    bubbleMode,
    onBubbleModeChange,
    bubbleColor,
    onBubbleColorChange,
    smsMode,
    onSmsModeChange,
    chatId,
    onBannerSelect,
    visibleTo,
    onPrivateNoteToggle,
    contentWarningsActive,
    onContentWarningsToggle,
    onUploadIconImage,
    onCalloutClose,
    worldTimelineConfig,
    timelineDate,
    onTimelineDateChange,
    mapPins,
    mapPinId,
    onMapPinChange,
}: {
    /** "drawer" : rendu en drawer plein écran (mobile, pas de survol — cf.
     *  `useMobileDrawer` côté parent) avec aperçu + confirmation explicite au
     *  lieu du survol desktop. */
    variant?: "dropdown" | "drawer";
    onSend: (content: string) => void;
    bubbleMode: boolean;
    onBubbleModeChange: (v: boolean) => void;
    bubbleColor: string | null;
    onBubbleColorChange: (v: string | null) => void;
    smsMode: boolean;
    onSmsModeChange: (v: boolean) => void;
    chatId?: string;
    onBannerSelect?: () => void;
    visibleTo: string[] | null;
    onPrivateNoteToggle: () => void;
    contentWarningsActive: boolean;
    onContentWarningsToggle: () => void;
    onUploadIconImage?: (file: File) => Promise<string | null>;
    onCalloutClose?: () => void;
    worldTimelineConfig?: WorldTimelineConfig | null;
    timelineDate?: WorldTimelineDate | null;
    onTimelineDateChange?: (d: WorldTimelineDate | null) => void;
    mapPins?: MapPinOption[];
    mapPinId?: string | null;
    onMapPinChange?: (id: string | null) => void;
}) {
    const t = useTranslations("chatrooms");
    const tChatrooms = useTranslations("chatrooms");
    const tCommon = useTranslations("common");
    const { chatroom_blocks, block_npc, block_hp, block_choice } = useFeatureFlags();
    const [open, setOpen] = useState(false);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<"dice" | "reveal" | "npc" | "hp" | "callout" | "anchor" | "choice" | "timeline" | "location" | null>(null);
    const [draftDate, setDraftDate] = useState<WorldTimelineDate>({ year: 1, month: null, day: null });
    const [draftPinId, setDraftPinId] = useState<string | null>(null);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const activeOptionsCount = [bubbleMode, smsMode, visibleTo !== null, contentWarningsActive, !!(worldTimelineConfig && timelineDate), !!(mapPins?.length && mapPinId)].filter(Boolean).length;

    useEffect(() => {
        // Desktop : le premier item est prévisualisé par défaut (mime le
        // survol). Drawer mobile : rien de déplié tant que l'utilisateur n'a
        // pas tapé une ligne (pas d'équivalent au survol au toucher).
        if (open) setActiveItemId(variant === "drawer" ? null : "dice");
    }, [open, variant]);

    const blockItems: ComposerMenuItem[] = [
        { id: "dice", icon: Dices, title: t("dice"), description: t("diceHint"), onActivate: () => { setOpen(false); setActiveTool("dice"); } },
        ...(onBannerSelect ? [{ id: "banner", icon: ImagePlus, title: t("banner"), description: t("bannerHint"), onActivate: () => { setOpen(false); onBannerSelect(); } }] : []),
        { id: "callout", icon: Square, title: t("calloutBtn"), description: t("calloutHint"), onActivate: () => { setOpen(false); setActiveTool("callout"); } },
        { id: "anchor", icon: Anchor, title: t("anchor"), description: t("anchorHint"), onActivate: () => { setOpen(false); setActiveTool("anchor"); } },
        { id: "reveal", icon: Eye, title: t("reveal"), description: t("revealHint"), onActivate: () => { setOpen(false); setActiveTool("reveal"); } },
        ...(chatroom_blocks && block_choice ? [{ id: "choice", icon: Vote, title: t("choice"), description: t("choiceHint"), onActivate: () => { setOpen(false); setActiveTool("choice"); } }] : []),
        ...(chatroom_blocks && block_npc ? [{ id: "npc", icon: Sword, title: t("npcCard"), description: t("npcHint"), onActivate: () => { setOpen(false); setActiveTool("npc"); } }] : []),
        ...(chatroom_blocks && block_hp ? [{ id: "hp", icon: Heart, title: t("healthBar"), description: t("hpHint"), onActivate: () => { setOpen(false); setActiveTool("hp"); } }] : []),
    ];

    const optionItems: ComposerMenuItem[] = [
        ...(worldTimelineConfig ? [{
            id: "timeline",
            icon: CalendarDays,
            title: timelineDate ? formatTimelineLabel(worldTimelineConfig, timelineDate) : t("timeline"),
            description: t("timelineHint"),
            checked: !!timelineDate,
            onActivate: () => {
                setOpen(false);
                setDraftDate(timelineDate ?? { year: worldTimelineConfig.current_year, month: worldTimelineConfig.current_month ?? null, day: null });
                setActiveTool("timeline");
            },
        }] : []),
        ...(mapPins && mapPins.length > 0 ? [{
            id: "location",
            icon: MapPin,
            title: mapPinId ? (mapPins.find(p => p.id === mapPinId)?.title ?? t("locationBtn")) : t("locationBtn"),
            description: t("locationHint"),
            checked: !!mapPinId,
            onActivate: () => { setOpen(false); setDraftPinId(mapPinId ?? null); setActiveTool("location"); },
        }] : []),
        { id: "bubbles", icon: MessageCircle, title: t("bubblesMode"), description: t("bubblesHint"), checked: bubbleMode, onActivate: () => onBubbleModeChange(!bubbleMode) },
        { id: "sms", icon: MessageSquareText, title: t("smsMode"), description: t("smsHint"), checked: smsMode, onActivate: () => onSmsModeChange(!smsMode) },
        { id: "privateNote", icon: Lock, title: t("privateNote"), description: t("privateNoteHint"), checked: visibleTo !== null, disabled: !chatId, onActivate: () => onPrivateNoteToggle() },
        { id: "contentWarning", icon: AlertTriangle, title: t("contentWarning"), description: t("contentWarningHint"), checked: contentWarningsActive, onActivate: () => onContentWarningsToggle() },
    ];

    const activeItem = [...blockItems, ...optionItems].find((i) => i.id === activeItemId) ?? blockItems[0] ?? null;

    function renderPreview(id: string): React.ReactNode {
        switch (id) {
            case "dice":
                return (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
                        <Dices className="h-5 w-5 shrink-0 text-primary" />
                        <div>
                            <div className="text-[11px] text-muted-foreground">Attaque</div>
                            <div className="font-mono text-base font-semibold">2d6+3 = 12</div>
                        </div>
                    </div>
                );
            case "banner":
                return (
                    <div className="flex h-20 w-full items-center justify-center rounded-xl border border-border-soft bg-muted text-muted-foreground">
                        <ImagePlus className="h-6 w-6" />
                    </div>
                );
            case "callout":
                return (
                    <div className="w-full rounded-xl border border-border-soft bg-card px-4 py-3">
                        <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                            <Square className="h-3.5 w-3.5" /> Titre
                        </div>
                        <div className="text-xs text-muted-foreground">{tChatrooms("calloutPlaceholder")}</div>
                    </div>
                );
            case "anchor":
                return (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-card px-3 py-1.5 text-xs text-muted-foreground">
                        <Anchor className="h-3 w-3" /> Prologue
                    </div>
                );
            case "reveal":
                return (
                    <div className="w-full rounded-xl border border-dashed border-border-soft px-4 py-3 text-center text-xs text-muted-foreground">
                        <Eye className="mx-auto mb-1 h-4 w-4" />
                        Cliquer pour révéler
                    </div>
                );
            case "choice":
                return (
                    <div className="grid w-full grid-cols-3 gap-1.5">
                        {["Nord", "Sud", "Est"].map((label, i) => (
                            <div
                                key={label}
                                className={cn(
                                    "rounded-lg border px-2 py-2 text-center text-[11px]",
                                    i === 0 ? "border-violet-500/50 bg-violet-500/10" : "border-border-soft bg-card",
                                )}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                );
            case "npc":
                return (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base">🗡️</div>
                        <div>
                            <div className="text-sm font-medium">{tChatrooms("npcExampleName")}</div>
                            <div className="text-[11px] text-muted-foreground">PV 40 · ATQ 12 · DEF 8</div>
                        </div>
                    </div>
                );
            case "hp":
                return (
                    <div className="w-full rounded-xl border border-border-soft bg-card px-4 py-3">
                        <div className="mb-1 flex justify-between text-xs">
                            <span>Garde</span><span>24/40</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-3/5 rounded-full bg-destructive" />
                        </div>
                    </div>
                );
            case "timeline":
                return (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
                        <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
                        <div className="text-sm">
                            {timelineDate && worldTimelineConfig
                                ? formatTimelineLabel(worldTimelineConfig, timelineDate)
                                : `${worldTimelineConfig?.year_label ?? "An"} ${worldTimelineConfig?.current_year ?? 1}`}
                        </div>
                    </div>
                );
            case "location":
                return (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
                        <MapPin className="h-5 w-5 shrink-0 text-primary" />
                        <div className="text-sm">
                            {mapPinId ? (mapPins?.find(p => p.id === mapPinId)?.title ?? t("locationBtn")) : t("locationBtn")}
                        </div>
                    </div>
                );
            case "bubbles":
                return (
                    <div className="flex w-full flex-col gap-3">
                        <div className="flex flex-col gap-2">
                            {["Bonjour...", "Comment vas-tu ?"].map((text, i) => (
                                <div key={i} className="inline-flex flex-nowrap items-end gap-2">
                                    <div
                                        className={cn("rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm leading-snug", !bubbleColor && "bg-muted")}
                                        style={bubbleColor ? { backgroundColor: bubbleColor + "33" } : undefined}
                                    >
                                        {text}
                                    </div>
                                    {i === 0 && <span className="shrink-0 pb-1 text-xs italic text-muted-foreground">dit-il.</span>}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpen(false); setColorPickerOpen(true); }}
                            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-soft px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span
                                className="size-3 shrink-0 rounded-full border border-border/60"
                                style={bubbleColor ? { backgroundColor: bubbleColor } : undefined}
                            >
                                {!bubbleColor && <Pipette className="m-auto size-2.5 text-muted-foreground" />}
                            </span>
                            {t("colorChoose")}
                        </button>
                    </div>
                );
            case "sms":
                return (
                    <div className="flex w-full flex-col gap-1.5">
                        <div className="flex items-end justify-end gap-1.5">
                            <div className="rounded-xl rounded-br-[3px] bg-primary/15 px-3 py-1.5 text-sm">Salut !</div>
                        </div>
                        <div className="flex items-end justify-end gap-1.5">
                            <div className="rounded-xl rounded-tr-[3px] bg-primary/15 px-3 py-1.5 text-sm">{tChatrooms("messageExample")}</div>
                        </div>
                        <div className="flex items-end justify-start gap-1.5">
                            <div className="rounded-xl rounded-tl-[3px] bg-muted px-3 py-1.5 text-sm">Oui, et toi ?</div>
                        </div>
                    </div>
                );
            case "privateNote":
                return (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3 text-sm text-muted-foreground">
                        <Lock className="h-5 w-5 shrink-0" />
                        Visible par vous seul(e)
                    </div>
                );
            case "contentWarning":
                return (
                    <div className="flex w-full flex-col gap-2 rounded-xl border border-border-soft bg-card px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="font-medium">{t("contentWarning")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {[t("contentWarningExample1"), t("contentWarningExample2")].map((tag) => (
                                <span key={tag} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    }

    const triggerContent = (
        <>
            <Component className="h-4 w-4" />
            {activeOptionsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-md bg-primary text-[9px] font-semibold text-primary-foreground leading-none">
                    {activeOptionsCount}
                </span>
            )}
        </>
    );
    const triggerClassName = cn(
        "relative size-9 rounded-md shrink-0 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border-soft",
        activeOptionsCount > 0 && "bg-muted",
    );

    return (
        <>
            {variant === "drawer" ? (
                <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
                    <DrawerTrigger render={<button type="button" title={t("insertBlock")} className={triggerClassName} />}>
                        {triggerContent}
                    </DrawerTrigger>
                    <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] [--drawer-inset:8px]">
                        <DrawerHeader>
                            <DrawerTitle>{t("insertBlock")}</DrawerTitle>
                            <DrawerDescription className="sr-only">{t("insertBlock")}</DrawerDescription>
                        </DrawerHeader>
                        {/* Pas de survol au toucher : taper une ligne la déplie sur place
                        (aperçu + description, bordure englobant tout le bloc) au lieu du
                        panneau latéral desktop. Une confirmation explicite déclenche l'action. */}
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                            <div className="px-1 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t("menuBlocksSection")}
                            </div>
                            <div className="flex flex-col gap-1.5 pb-3">
                                {blockItems.map((item) => (
                                    <ComposerMenuAccordionRow
                                        key={item.id}
                                        item={item}
                                        isOpen={activeItemId === item.id}
                                        onToggle={() => setActiveItemId(activeItemId === item.id ? null : item.id)}
                                        onConfirm={() => { item.onActivate(); setActiveItemId(null); }}
                                        renderPreview={renderPreview}
                                        confirmLabel={tCommon("confirm")}
                                    />
                                ))}
                            </div>
                            <div className="px-1 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t("menuOptionsSection")}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {optionItems.map((item) => (
                                    <ComposerMenuAccordionRow
                                        key={item.id}
                                        item={item}
                                        isOpen={activeItemId === item.id}
                                        onToggle={() => setActiveItemId(activeItemId === item.id ? null : item.id)}
                                        onConfirm={() => { item.onActivate(); setActiveItemId(null); }}
                                        renderPreview={renderPreview}
                                        confirmLabel={tCommon("confirm")}
                                    />
                                ))}
                            </div>
                        </div>
                    </DrawerContent>
                </Drawer>
            ) : (
                <DropdownMenu open={open} onOpenChange={setOpen}>
                    <DropdownMenuTrigger asChild>
                        <button type="button" title={t("insertBlock")} className={triggerClassName}>
                            {triggerContent}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-[calc(100vw-2rem)] max-w-[520px] p-0 overflow-hidden sm:w-[520px]">
                        <div className="flex max-h-[24rem]">
                            <div className="min-w-0 flex-1 overflow-y-auto p-2 sm:border-r sm:border-border-soft">
                                <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t("menuBlocksSection")}
                                </div>
                                {blockItems.map((item) => (
                                    <ComposerMenuRow key={item.id} item={item} isActive={activeItemId === item.id} onHover={() => setActiveItemId(item.id)} />
                                ))}
                                <div className="px-2 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t("menuOptionsSection")}
                                </div>
                                {optionItems.map((item) => (
                                    <ComposerMenuRow key={item.id} item={item} isActive={activeItemId === item.id} onHover={() => setActiveItemId(item.id)} />
                                ))}
                            </div>

                            <div className="hidden w-52 shrink-0 flex-col p-4 sm:flex">
                                {activeItem && (
                                    <>
                                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                            <activeItem.icon className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{activeItem.title}</span>
                                        </div>
                                        <div className="mb-3 flex flex-1 items-center justify-center">
                                            {renderPreview(activeItem.id)}
                                        </div>
                                        <p className="text-xs leading-snug text-muted-foreground">{activeItem.description}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                <DialogContent className="max-w-sm p-0 overflow-hidden">
                    <div className="flex">
                        {/* Aperçu + jauge de contraste */}
                        <div className="w-40 shrink-0 bg-background flex flex-col gap-3 p-4 pr-6">
                            <div className="flex flex-col gap-3 flex-1 justify-center">
                                {["Bonjour...", "Comment vas-tu ?"].map((text, i) => (
                                    <div key={i} className="inline-flex items-end gap-2 flex-nowrap">
                                        <div
                                            className={cn("rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm leading-snug whitespace-nowrap", !bubbleColor && "bg-muted")}
                                            style={bubbleColor ? { backgroundColor: bubbleColor + "33" } : undefined}
                                        >
                                            {text}
                                        </div>
                                        {i === 0 && <span className="text-xs text-muted-foreground italic pb-1 shrink-0">dit-il.</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contrôles */}
                        <div className="flex-1 flex flex-col gap-4 p-4 border-l border-border">
                            <DialogHeader>
                                <DialogTitle className="text-sm">{t("dialogColorTitle")}</DialogTitle>
                            </DialogHeader>

                            <HsvColorPicker
                                color={bubbleColor ?? "#1d4ed8"}
                                onChange={onBubbleColorChange}
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => onBubbleColorChange(null)}
                                    className="flex-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {t("colorReset")}
                                </button>
                                <Button size="sm" onClick={() => setColorPickerOpen(false)}>
                                    {t("colorConfirm")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {worldTimelineConfig && (
                <Dialog open={activeTool === "timeline"} onOpenChange={(v) => !v && setActiveTool(null)}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>{t("timelineTitle")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="flex items-center gap-3">
                                <label className="w-24 shrink-0 text-sm text-muted-foreground">
                                    {worldTimelineConfig.year_label}
                                    {worldTimelineConfig.era_name && <span className="ml-1 text-muted-foreground/60">{worldTimelineConfig.era_name}</span>}
                                </label>
                                <input
                                    type="number"
                                    className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
                                    value={draftDate.year}
                                    onChange={(e) => setDraftDate((d) => ({ ...d, year: parseInt(e.target.value, 10) || 1 }))}
                                />
                            </div>
                            {worldTimelineConfig.month_names.length > 0 && (
                                <div className="flex items-center gap-3">
                                    <label className="w-24 shrink-0 text-sm text-muted-foreground">{t("month")}</label>
                                    <select
                                        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                                        value={draftDate.month ?? ""}
                                        onChange={(e) => setDraftDate((d) => ({ ...d, month: e.target.value === "" ? null : Number(e.target.value), day: null }))}
                                    >
                                        <option value="">—</option>
                                        {worldTimelineConfig.month_names.map((m, i) => (
                                            <option key={i} value={i}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {draftDate.month !== null && (
                                <div className="flex items-center gap-3">
                                    <label className="w-24 shrink-0 text-sm text-muted-foreground">{t("day")}</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        placeholder="—"
                                        className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
                                        value={draftDate.day ?? ""}
                                        onChange={(e) => setDraftDate((d) => ({ ...d, day: e.target.value ? Math.min(31, Math.max(1, parseInt(e.target.value, 10))) : null }))}
                                    />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            {timelineDate && (
                                <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => { onTimelineDateChange?.(null); setActiveTool(null); }}>
                                    {t("removeDate")}
                                </Button>
                            )}
                            <Button size="sm" onClick={() => { onTimelineDateChange?.(draftDate); setActiveTool(null); }}>
                                {t("colorConfirm")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {mapPins && mapPins.length > 0 && (
                <Dialog open={activeTool === "location"} onOpenChange={(v) => !v && setActiveTool(null)}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>{t("locationTitle")}</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-64">
                            <div className="space-y-1 py-1">
                                {mapPins.map(pin => (
                                    <button
                                        key={pin.id}
                                        type="button"
                                        onClick={() => setDraftPinId(pin.id === draftPinId ? null : pin.id)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                            draftPinId === pin.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
                                        )}
                                    >
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
                                        {pin.title}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                        <DialogFooter>
                            {mapPinId && (
                                <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => { onMapPinChange?.(null); setActiveTool(null); }}>
                                    {t("removeLocation")}
                                </Button>
                            )}
                            <Button size="sm" onClick={() => { onMapPinChange?.(draftPinId); setActiveTool(null); }}>
                                {t("colorConfirm")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <DiceDialog
                open={activeTool === "dice"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
            <CalloutDialog
                open={activeTool === "callout"}
                onOpenChange={(v) => { if (!v) { setActiveTool(null); onCalloutClose?.(); } }}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
                onUploadIconImage={onUploadIconImage}
            />
            <NarrativeBlockDialog
                blockType="reveal"
                open={activeTool === "reveal"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
            <NpcDialog
                open={activeTool === "npc"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
            <HpDialog
                open={activeTool === "hp"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
            <AnchorDialog
                open={activeTool === "anchor"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
            <ChoiceDialog
                open={activeTool === "choice"}
                onOpenChange={(v) => !v && setActiveTool(null)}
                onSend={(content) => { onSend(content); setActiveTool(null); }}
            />
        </>
    );
}
