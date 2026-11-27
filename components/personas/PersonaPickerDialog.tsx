"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StoredImage } from "@/components/ui/stored-image";
import type { Persona } from "@/types/db-chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SectionLabel } from "@/components/ui/section-label";
import { Input } from "@/components/ui/input";
import { Star, UserPlus, Lock, Search } from "lucide-react";
import { normalizeForSearch } from "@/lib/chatSearchDirectory";
import { useTranslations } from "next-intl";
import { getInitials } from "@/lib/textFormatting";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LOCK_REASON_KEYS, LOCK_REASON_LABEL_KEYS, getUsablePersonaIds, personaLockReason } from "@/lib/personaEligibility";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import { PersonaNpcBadge } from "./PersonaNpcBadge";
import { avatarThumbWidth } from "@/lib/storage";

function PersonaAvatarThumb({ url, name, size }: { url: string; name: string; size: number }) {
  // Palier partagé plutôt que `size * 3` : c'est ce qui fait que le même
  // persona affiché ici, sur sa carte ou dans sa fiche demande une seule et
  // même image, déjà en cache dès la deuxième vue.
  return (
    <StoredImage url={url} width={avatarThumbWidth(size)} alt={name} className="object-cover" draggable={false} />
  );
}

function PersonaRow({
  persona,
  selected,
  favorite,
  locked,
  lockedHint,
  lockedLabel,
  onSelect,
  onToggleFavorite,
  favoriteLabel,
  groupLabel,
}: {
  persona: Persona;
  selected: boolean;
  favorite: boolean;
  locked: boolean;
  lockedHint: string;
  /** La raison du verrou en quelques mots, visible sous le nom. */
  lockedLabel: string;
  onSelect: () => void;
  onToggleFavorite: () => void;
  favoriteLabel: string;
  /** Un titre au-dessus de la ligne — le premier PNJ ouvre le groupe. */
  groupLabel?: string;
}) {
  return (
    <>
    {groupLabel && (
      <SectionLabel as="p" className="mt-2 px-2.5 pb-1">{groupLabel}</SectionLabel>
    )}
    <div
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
        !locked && (selected ? "bg-muted" : "hover:bg-muted/60"),
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={locked}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none disabled:cursor-not-allowed"
        aria-pressed={selected}
      >
        {/* Seuls l'avatar et le nom s'estompent : la raison du verrou reste lisible. */}
        <span className={cn("relative shrink-0 overflow-hidden bg-muted size-9 rounded-md", locked && "opacity-50")}>
          {persona.avatar_url ? (
            <PersonaAvatarThumb url={persona.avatar_url} name={persona.name} size={36} />
          ) : (
            <span className="grid h-full w-full place-items-center text-xs font-bold text-muted-foreground">
              {getInitials(persona.name)}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-sm font-medium", locked && "opacity-50")}>{persona.name}</span>
          {locked && <span className="text-xs text-muted-foreground">{lockedLabel}</span>}
        </span>
        <PersonaNpcBadge isNpc={persona.is_npc} />
        {selected && !locked && (
          <span className="grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground rounded-full">
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>

      {locked && (
        <Hint content={lockedHint} side="left">
          <span className="shrink-0 text-muted-foreground" aria-label={lockedHint}>
            <Lock size={15} />
          </span>
        </Hint>
      )}

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favoriteLabel}
        className="shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-warning focus-visible:outline-none"
      >
        <Star size={18} className={favorite ? "fill-warning text-warning" : ""} />
      </button>
    </div>
    </>
  );
}

export function PersonaPickerDialog({
  selected,
  onSelect,
  trigger,
  required = true,
  userId,
  worldId,
  variant = "dialog",
  allowedIds = null,
  notAllowedHint,
}: {
  selected: Persona | null;
  onSelect: (persona: Persona | null) => void;
  /** Doit être un élément unique (pas juste un `ReactNode`) : cloné via
   *  `asChild` (Dialog) ou passé à `render` (Drawer/Base UI), qui exige
   *  un `ReactElement`. */
  trigger?: React.ReactElement;
  required?: boolean;
  userId?: string | null;
  worldId?: string | null;
  /** "drawer" : rendu comme drawer — se nest automatiquement si monté sous
   *  un `<Drawer>` ancêtre déjà ouvert (ex: composer mobile). */
  variant?: "dialog" | "drawer";
  /**
   * Les seuls personas permis ici (les invités d'un salon public ou privé,
   * migration 225) ; les autres s'affichent verrouillés avec `notAllowedHint`.
   * `null` : pas de restriction.
   */
  allowedIds?: ReadonlySet<string> | null;
  notAllowedHint?: string;
}) {
  const t = useTranslations("personas");
  const tCommon = useTranslations("common");
  const { plan } = useCurrentUser();
  // Les PNJ du monde (migration 182) : proposés à qui a « Jouer les PNJ »,
  // sous leur propre titre. Le contexte n'est celui du monde que sous
  // `/w/[id]` ou dans un de ses salons.
  const { worldId: membershipWorldId, can } = useWorldMembership();
  const canPlayNpc = !!worldId && membershipWorldId === worldId && can("npc.play");
  // Le monde relit-il ses fiches (migration 184) ? Sinon l'état de relecture ne verrouille rien.
  const reviewActive = useWorldReviewActive(worldId) !== false;
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [value, setValue] = useState<string>(selected?.id ?? "");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId ?? null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => setValue(selected?.id ?? ""), [selected?.id, open]);
  // La recherche repart de zéro à chaque ouverture.
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) setQuery(""); }, [open]);

  const favoritesKey = resolvedUserId ? `persona-favorites:${resolvedUserId}` : null;

  // Charge les favoris (localStorage, propre à l'utilisateur) dès qu'on connaît son id.
  useEffect(() => {
    if (!favoritesKey) return;
    try {
      const raw = localStorage.getItem(favoritesKey);
      setFavorites(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setFavorites(new Set());
    }
  }, [favoritesKey]);

  function toggleFavorite(personaId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(personaId)) next.delete(personaId);
      else next.add(personaId);
      if (favoritesKey) {
        try { localStorage.setItem(favoritesKey, JSON.stringify([...next])); } catch { }
      }
      return next;
    });
  }

  // Recharge à chaque ouverture pour avoir les avatars à jour
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      let uid = userId ?? null;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id ?? null;
      }
      setResolvedUserId(uid);
      if (!uid) { setLoading(false); return; }
      let query = supabase
        .from("personas")
        .select("id, user_id, name, avatar_url, dialogue_color, created_at, review_status, sheet_complete, is_npc")
        .eq("is_template", false)
        .order("name", { ascending: true });
      // Les siens ; et, dans un monde où l'on joue les PNJ, ceux du monde.
      query = canPlayNpc ? query.or(`user_id.eq.${uid},is_npc.eq.true`) : query.eq("user_id", uid).eq("is_npc", false);
      if (worldId) query = query.eq("world_id", worldId);
      const { data } = await query;
      setPersonas(data ?? []);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, worldId, open, canPlayNpc]);

  // Les siens d'abord (favoris en tête), puis les PNJ du monde.
  const sortedPersonas = useMemo(() => {
    return [...personas].sort((a, b) => {
      if (!!a.is_npc !== !!b.is_npc) return a.is_npc ? 1 : -1;
      const favA = favorites.has(a.id);
      const favB = favorites.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [personas, favorites]);
  // Sur le nom, sans accents ni casse : « elodie » trouve « Élodie ».
  const visiblePersonas = useMemo(() => {
    const needle = normalizeForSearch(query);
    return needle ? sortedPersonas.filter((p) => normalizeForSearch(p.name).includes(needle)) : sortedPersonas;
  }, [sortedPersonas, query]);
  const firstNpcId = useMemo(() => visiblePersonas.find((p) => p.is_npc)?.id ?? null, [visiblePersonas]);

  // Plan gratuit : seuls les 5 personas les plus anciens (par monde) restent
  // sélectionnables — les autres s'affichent verrouillés (voir migration 090).
  const eligibility = useMemo(
    () => personas.map((p) => ({ id: p.id, created_at: p.created_at ?? "", review_status: p.review_status, sheet_complete: p.sheet_complete, is_npc: p.is_npc })),
    [personas],
  );
  const usableIds = useMemo(() => getUsablePersonaIds(eligibility, plan, reviewActive), [eligibility, plan, reviewActive]);
  // La raison du verrou, par persona : la fiche avant le quota.
  const lockReasonById = useMemo(
    () => new Map(eligibility.map((p) => [p.id, personaLockReason(p, usableIds, reviewActive)] as const)),
    [eligibility, usableIds, reviewActive],
  );

  const canConfirm = !!value && (!required || !!value);

  function confirm() {
    const chosen = personas.find((p) => p.id === value) ?? null;
    onSelect(chosen);
    setOpen(false);
  }

  // ── Trigger par défaut ──────────────────────────────────────────────
  //
  // C'est le BOUTON qui déclenche, pas le `<span>` qui l'entoure.
  //
  // Auparavant l'hôte était ce span, avec le bouton imbriqué dedans. Le
  // composant y posait `type="button"`, `aria-haspopup="dialog"` et
  // `aria-expanded` — trois attributs qu'ARIA interdit sur un `<span>` sans
  // rôle, et qui étaient donc simplement ignorés : rien n'annonçait que ce
  // repère ouvre une fenêtre.
  //
  // Le span reste, purement décoratif : il ancre l'anneau de pulsation, qui ne
  // peut pas vivre dans le bouton — celui-ci est en `overflow-hidden` pour
  // rogner l'avatar, ce qui rognerait aussi l'anneau.
  const contenuDuBouton = selected ? (
    selected.avatar_url ? (
      <PersonaAvatarThumb url={selected.avatar_url} name={selected.name} size={36} />
    ) : (
      <span className="h-full w-full grid place-items-center text-xs font-bold  text-muted-foreground">
        {getInitials(selected.name)}
      </span>
    )
  ) : (
    <span className="h-full w-full grid place-items-center  text-muted-foreground bg-background hover:bg-muted border rounded-md">
      <UserPlus size={16} />
    </span>
  );

  /**
   * Le bouton hôte, complet avec son contenu, pour Radix (`asChild`) comme
   * pour Base UI (`render`). Base UI garde les enfants de l'élément rendu :
   * un `<button>{undefined}</button>` passé en `render` écrasait ceux du
   * déclencheur, et le bouton du tiroir restait vide.
   */
  const boutonParDefaut = (enfants: React.ReactNode) => (
    <button
      type="button"
      aria-label={selected ? selected.name : t("pick")}
      className="relative flex size-9 items-center justify-center rounded-md overflow-hidden shrink-0"
    >
      {enfants}
    </button>
  );

  /** Enveloppe décorative : l'anneau de pulsation, puis le trigger réel. */
  const avecAnneau = (declencheur: React.ReactNode) => (
    <span className="relative inline-block shrink-0">
      {!selected && (
        <span className="absolute inset-0 rounded-md animate-ping pointer-events-none bg-primary/30 scale-65" />
      )}
      {declencheur}
    </span>
  );

  const rows = visiblePersonas.map((p) => {
    const reason = lockReasonById.get(p.id) ?? "quota";
    const uninvited = !!allowedIds && !allowedIds.has(p.id) && !!notAllowedHint;
    return (
    <PersonaRow
      key={p.id}
      groupLabel={p.id === firstNpcId ? t("npc.pickerGroup") : undefined}
      persona={p}
      selected={value === p.id}
      favorite={favorites.has(p.id)}
      locked={!usableIds.has(p.id) || (!!allowedIds && !allowedIds.has(p.id))}
      lockedHint={uninvited ? notAllowedHint! : t(LOCK_REASON_KEYS[reason])}
      lockedLabel={uninvited ? notAllowedHint! : t(LOCK_REASON_LABEL_KEYS[reason])}
      onSelect={() => setValue(p.id)}
      onToggleFavorite={() => toggleFavorite(p.id)}
      favoriteLabel={t("toggleFavorite")}
    />
    );
  });

  const emptyOrLoading = loading ? (
    <div className="flex flex-col gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  ) : personas.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {t("pickerEmpty")}
    </p>
  ) : null;

  const searchField = emptyOrLoading ? null : (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("pickerSearch")}
        aria-label={t("pickerSearch")}
        className="pl-9"
      />
    </div>
  );

  const list = emptyOrLoading ?? (
    rows.length > 0 ? (
      <div className="flex flex-col gap-1 pb-1">{rows}</div>
    ) : (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("list.noMatch")}</p>
    )
  );

  if (variant === "drawer") {
    return (
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        {trigger ? (
          // `nativeButton` reste à sa valeur par défaut : les déclencheurs
          // fournis sont des boutons natifs. Le forcer à `false` faisait
          // poser à Base UI un `role` et un `aria-disabled` sur un `<button>`
          // qui les portait déjà — et la console le disait à chaque rendu.
          <DrawerTrigger render={trigger} />
        ) : (
          avecAnneau(<DrawerTrigger render={boutonParDefaut(contenuDuBouton)} />)
        )}
        <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] [--drawer-inset:8px]">
          <DrawerHeader>
            <DrawerTitle>{t("pick")}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("pick")}</DrawerDescription>
          </DrawerHeader>
          {/* Conteneur scrollable natif (flex item, pas de ScrollArea) —
              c'est le pattern recommandé par Base UI pour le contenu
              défilant d'un drawer. */}
          {searchField && <div className="px-4 pb-2">{searchField}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto px-4">{list}</div>
          <DrawerFooter className="flex-row gap-2">
            <DrawerClose render={<Button variant="secondary" className="flex-1" />}>
              {tCommon("cancel")}
            </DrawerClose>
            <Button className="flex-1" disabled={!canConfirm} onClick={confirm}>
              {tCommon("confirm")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        avecAnneau(
          <DialogTrigger asChild>{boutonParDefaut(contenuDuBouton)}</DialogTrigger>,
        )
      )}

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("pick")}</DialogTitle>
          <DialogDescription className="sr-only">{t("pick")}</DialogDescription>
        </DialogHeader>

        {searchField}
        {emptyOrLoading ?? (
          <ScrollArea className="max-h-[60vh]">
            <div className="pr-3">{list}</div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tCommon("cancel")}</Button>
          </DialogClose>
          <Button disabled={!canConfirm} onClick={confirm}>
            {tCommon("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
