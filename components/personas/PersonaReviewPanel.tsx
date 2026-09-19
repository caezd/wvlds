"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Send, Trash2, Undo2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { RPC, TABLE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relativeTime";
import { fetchPersonaSections } from "@/lib/personaSections";
import { missingRequiredFields, templateRequiredFields, type MissingRequiredField, type TemplateRequiredField } from "@/lib/personaCompleteness";
import { reviewStatusOf } from "@/lib/personaReview";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { PersonaSheetBadge } from "./PersonaSheetBadge";
import type { PersonaReviewStatus } from "@/types/db";
import type { PersonaSectionWithFields } from "@/types/personas";

/** Le libellé d'un type de champ (clé i18n `personas.fieldTypes`). */
function fieldTypeKey(type: string): string {
  return type === "image-grid" ? "imageGrid" : type;
}

/** Les champs obligatoires du modèle du monde, chargés une fois par monde. */
function useTemplateRequiredFields(worldId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const [required, setRequired] = useState<TemplateRequiredField[] | null>(worldId ? null : []);
  useEffect(() => {
    if (!worldId) { setRequired([]); return; }
    let cancelled = false;
    (async () => {
      const { data: template } = await supabase
        .from(TABLE.PERSONAS)
        .select("id")
        .eq("world_id", worldId)
        .eq("is_template", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (!template) { setRequired([]); return; }
      const sections = await fetchPersonaSections(supabase, (template as { id: string }).id);
      if (!cancelled) setRequired(templateRequiredFields(sections));
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId]);
  return required;
}

/** La liste de ce qui manque, avec le bouton de synchronisation si des champs sont absents. */
function MissingFieldsList({
  missing,
  onSync,
  syncing,
}: {
  missing: MissingRequiredField[];
  onSync?: () => void;
  syncing?: boolean;
}) {
  const t = useTranslations("personas.review");
  const tTypes = useTranslations("personas.fieldTypes");
  if (missing.length === 0) return null;
  const absent = missing.some((m) => m.fieldId === null);
  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs" data-testid="missing-fields">
      <p className="flex items-center gap-1.5 font-medium text-orange-700 dark:text-orange-300">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        {t("missingTitle")}
      </p>
      <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
        {missing.map((m) => {
          const typeKey = fieldTypeKey(m.type);
          const field = m.label ?? (tTypes.has(typeKey) ? tTypes(typeKey) : t("fieldTypeFallback"));
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{t("missingField", { section: m.sectionName, field })}</span>
              <span className="shrink-0 italic">{m.fieldId === null ? t("missingAbsent") : t("missingEmpty")}</span>
            </li>
          );
        })}
      </ul>
      {absent && onSync && (
        <Button type="button" variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          {t("syncFields")}
        </Button>
      )}
    </div>
  );
}

// ── Le propriétaire : soumettre sa fiche ────────────────────────────────────

export function PersonaSubmitBar({
  personaId,
  worldId,
  sections,
  initialReviewStatus,
  onSectionsReload,
  className,
}: {
  personaId: string;
  worldId: string | null | undefined;
  sections: PersonaSectionWithFields[];
  initialReviewStatus?: PersonaReviewStatus | null;
  /** Après une synchronisation avec le modèle : la fiche a de nouveaux champs. */
  onSectionsReload?: (sections: PersonaSectionWithFields[]) => void;
  className?: string;
}) {
  const t = useTranslations("personas.review");
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [status, setStatus] = useState<PersonaReviewStatus>(reviewStatusOf(initialReviewStatus));
  const [busy, setBusy] = useState<null | "submit" | "sync">(null);
  const [lastSentBack, setLastSentBack] = useState<{ body: string; author: string | null } | null>(null);
  const required = useTemplateRequiredFields(worldId);
  // Le monde relit-il (migration 184) ? Sinon : la liste de ce qui manque, rien d'autre.
  const reviewActive = useWorldReviewActive(worldId) === true;

  const missing = useMemo(() => (required ? missingRequiredFields(sections, required) : []), [sections, required]);
  const complete = required !== null && missing.length === 0;

  // Renvoyée en brouillon : le dernier mot du relecteur, en bandeau.
  useEffect(() => {
    if (status !== "draft" || !worldId || !reviewActive) { setLastSentBack(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(TABLE.PERSONA_REVIEW_COMMENTS)
        .select("body, author:author_id(username)")
        .eq("persona_id", personaId)
        .eq("decision", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as unknown as { body: string; author: { username: string | null } | null };
      setLastSentBack({ body: row.body, author: row.author?.username ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, personaId, status, worldId, reviewActive]);

  async function submit() {
    setBusy("submit");
    const { error } = await supabase.rpc(RPC.SUBMIT_PERSONA_FOR_REVIEW, { p_persona_id: personaId });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setStatus("submitted");
    toast.success(t("submitted"));
    router.refresh();
  }

  async function sync() {
    setBusy("sync");
    const { data, error } = await supabase.rpc(RPC.SYNC_PERSONA_TEMPLATE_FIELDS, { p_persona_id: personaId });
    if (error) { setBusy(null); toast.error(error.message); return; }
    const next = await fetchPersonaSections(supabase, personaId);
    setBusy(null);
    onSectionsReload?.(next);
    toast.success(t("syncDone", { count: Number(data ?? 0) }));
    router.refresh();
  }

  // Hors monde : rien à valider. Sans relecture et sans manque : rien à dire.
  if (!worldId) return null;
  if (!reviewActive && missing.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)} data-review-status={reviewActive ? status : "inactive"}>
      {lastSentBack && status === "draft" && (
        <div className="rounded-lg border border-border-soft bg-muted/40 px-3 py-2 text-xs">
          <p className="font-medium">{t("sentBack")}</p>
          {lastSentBack.body && (
            <p className="mt-0.5 text-muted-foreground">
              {lastSentBack.author ? `@${lastSentBack.author} — ` : ""}{lastSentBack.body}
            </p>
          )}
        </div>
      )}
      <MissingFieldsList missing={missing} onSync={sync} syncing={busy === "sync"} />
      {reviewActive && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PersonaSheetBadge persona={{ review_status: status, sheet_complete: required === null ? true : complete }} showApproved />
        {status === "submitted" ? (
          <p className="text-xs text-muted-foreground">{t("waiting")}</p>
        ) : status === "draft" ? (
          <Button type="button" size="sm" onClick={submit} disabled={!complete || busy !== null}>
            {busy === "submit" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            {lastSentBack ? t("resubmit") : t("submit")}
          </Button>
        ) : null}
      </div>
      )}
    </div>
  );
}

// ── La relecture : fil de commentaires et décision ──────────────────────────

type ReviewComment = {
  id: string;
  author_id: string | null;
  body: string;
  decision: PersonaReviewStatus | null;
  created_at: string;
  author: { username: string | null } | null;
};

export function PersonaReviewSection({
  personaId,
  worldId,
  ownerId,
  reviewStatus,
  sheetComplete,
  canReview,
  onStatusChange,
}: {
  personaId: string;
  worldId: string;
  ownerId: string;
  reviewStatus: PersonaReviewStatus;
  sheetComplete: boolean;
  canReview: boolean;
  onStatusChange?: (status: PersonaReviewStatus) => void;
}) {
  const t = useTranslations("personas.review");
  const tCard = useTranslations("worlds.members.card");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { userId } = useCurrentUser();
  const [comments, setComments] = useState<ReviewComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "comment" | "approved" | "draft">(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.PERSONA_REVIEW_COMMENTS)
      .select("id, author_id, body, decision, created_at, author:author_id(username)")
      .eq("persona_id", personaId)
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setComments((data ?? []) as unknown as ReviewComment[]);
  }, [supabase, personaId]);

  useEffect(() => { void load(); }, [load]);

  async function postComment() {
    const body = draft.trim();
    if (!body || !userId) return;
    setBusy("comment");
    const { error } = await supabase
      .from(TABLE.PERSONA_REVIEW_COMMENTS)
      .insert({ persona_id: personaId, world_id: worldId, author_id: userId, body });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    await load();
  }

  async function decide(decision: "approved" | "draft") {
    setBusy(decision);
    const { error } = await supabase.rpc(RPC.REVIEW_PERSONA, {
      p_persona_id: personaId,
      p_decision: decision,
      p_comment: draft.trim() || null,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    toast.success(t("decided"));
    onStatusChange?.(decision);
    await load();
    router.refresh();
  }

  async function removeComment(id: string) {
    const { error } = await supabase.from(TABLE.PERSONA_REVIEW_COMMENTS).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setComments((prev) => prev?.filter((c) => c.id !== id) ?? null);
  }

  const isOwner = userId === ownerId;
  const canWrite = !!userId && (isOwner || canReview);

  return (
    <div className="space-y-4" data-testid="persona-review-section">
      <div className="flex flex-wrap items-center gap-2">
        <PersonaSheetBadge persona={{ review_status: reviewStatus, sheet_complete: sheetComplete }} showApproved />
        {canReview && reviewStatus !== "approved" && (
          <Button type="button" size="sm" onClick={() => decide("approved")} disabled={busy !== null}>
            {busy === "approved" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            {t("approve")}
          </Button>
        )}
        {canReview && reviewStatus !== "draft" && (
          <Button type="button" size="sm" variant="outline" onClick={() => decide("draft")} disabled={busy !== null} title={t("sendBack")}>
            {busy === "draft" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
            {t("sendBackShort")}
          </Button>
        )}
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("comments")}</h4>
        {comments === null ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}</div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noComments")}</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="group/comment rounded-lg border border-border-soft px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    <span className="font-medium text-foreground">{c.author?.username ? `@${c.author.username}` : "—"}</span>
                    {c.decision && (
                      <span className={cn("ml-1.5", c.decision === "approved" ? "text-emerald-700 dark:text-emerald-300" : "text-orange-700 dark:text-orange-300")}>
                        {c.decision === "approved" ? t("decisionApproved") : t("decisionDraft")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <time dateTime={c.created_at}>{relativeTime(c.created_at, locale, tCard("justNow"))}</time>
                    {c.author_id === userId && (
                      <button
                        type="button"
                        onClick={() => void removeComment(c.id)}
                        aria-label={t("deleteComment")}
                        title={t("deleteComment")}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/comment:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
                {c.body && <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite && (
        <div className="space-y-2">
          <AutoResizeTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canReview ? t("reviewCommentPlaceholder") : t("commentPlaceholder")}
            aria-label={t("commentPlaceholder")}
            maxLength={2000}
            minRows={2}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={postComment} disabled={!draft.trim() || busy !== null}>
              {busy === "comment" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {t("send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
