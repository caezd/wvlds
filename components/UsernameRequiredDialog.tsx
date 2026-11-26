"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ERR_NOM_UTILISATEUR_PRIS, messageErreurAction } from "@/lib/actionErrors";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { USERNAME_MAX } from "@/lib/username";

/**
 * Le pseudo d'un compte qui n'en a pas : se choisit désormais à l'inscription
 * (migration 266) ; cette fenêtre ne sert plus qu'aux comptes d'avant, ou dont
 * le pseudo a été pris entre la vérification et la création du compte. Même
 * vérification en direct qu'à l'inscription.
 */
export function UsernameRequiredDialog({ userId }: { userId: string }) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const availability = useUsernameAvailability(username);
  const bad = availability.status === "invalid" || availability.status === "taken";
  const canSubmit = availability.status === "available" || availability.status === "error";

  function startEditing() {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;
    const trimmed = username;

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", userId);
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          throw new Error(ERR_NOM_UTILISATEUR_PRIS);
        }
        throw error;
      }
      setOpen(false);
      router.refresh();
    } catch (error: unknown) {
      // Pas `e.message` : texte brut de PostgreSQL, il nomme table et policy.
      console.error("[UsernameRequiredDialog]", error);
      setError(messageErreurAction(error instanceof Error ? error.message : null, tCommon));
      startEditing();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogTitle className="sr-only">{t("usernameRequired.dialogTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("usernameRequired.dialogDescription")}</DialogDescription>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-center gap-8 py-8 text-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
              {t("usernameRequired.greeting")}
            </span>
            {editing ? (
              <div className="flex items-center rounded-full border-2 border-dashed border-border px-4 py-2.5">
                <label htmlFor="required-username" className="sr-only">
                  {t("usernameRequired.placeholder")}
                </label>
                <input
                  ref={inputRef}
                  id="required-username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => {
                    if (!username.trim()) setEditing(false);
                  }}
                  placeholder={t("usernameRequired.placeholder")}
                  maxLength={USERNAME_MAX + 8}
                  aria-invalid={bad}
                  aria-describedby="required-username-status"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  className="w-32 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 sm:w-40 sm:text-xl"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-2 rounded-full border-2 border-dashed border-border px-4 py-2.5 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-lg font-semibold sm:text-xl">
                  {t("usernameRequired.addButton")}
                </span>
              </button>
            )}
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : availability.status === "idle" ? (
            <p className="text-sm text-muted-foreground">{t("usernameRequired.helper")}</p>
          ) : (
            <p
              id="required-username-status"
              aria-live="polite"
              className={`flex items-center gap-1.5 text-sm ${bad ? "text-destructive" : availability.status === "available" ? "text-foreground" : "text-muted-foreground"}`}
            >
              {availability.status === "checking" && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
              {availability.status === "available" && <Check className="size-4 shrink-0" aria-hidden />}
              {bad && <X className="size-4 shrink-0" aria-hidden />}
              {availability.status === "invalid"
                ? t(`username.${availability.problem}`)
                : t(`username.${availability.status}`)}
            </p>
          )}
          <Button
            type="submit"
            className="w-full max-w-[200px]"
            disabled={isLoading || !canSubmit}
          >
            {isLoading ? t("usernameRequired.saving") : t("usernameRequired.continue")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
