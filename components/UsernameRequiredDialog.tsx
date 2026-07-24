"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

export function UsernameRequiredDialog({ userId }: { userId: string }) {
  const t = useTranslations("auth.usernameRequired");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function startEditing() {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setError(t("invalidError"));
      startEditing();
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", userId);
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          throw new Error(t("takenError"));
        }
        throw error;
      }
      setOpen(false);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : tCommon("error"));
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
        <DialogTitle className="sr-only">{t("dialogTitle")}</DialogTitle>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-center gap-8 py-8 text-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
              {t("greeting")}
            </span>
            {editing ? (
              <div className="flex items-center rounded-full border-2 border-dashed border-border-soft px-4 py-2.5">
                <label htmlFor="required-username" className="sr-only">
                  {t("placeholder")}
                </label>
                <input
                  ref={inputRef}
                  id="required-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => {
                    if (!username.trim()) setEditing(false);
                  }}
                  placeholder={t("placeholder")}
                  maxLength={32}
                  autoComplete="username"
                  className="w-32 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 sm:w-40 sm:text-xl"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-2 rounded-full border-2 border-dashed border-border-soft px-4 py-2.5 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-lg font-semibold sm:text-xl">
                  {t("addButton")}
                </span>
              </button>
            )}
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("helper")}</p>
          )}
          <Button
            type="submit"
            className="w-full max-w-[200px]"
            disabled={isLoading || !username.trim()}
          >
            {isLoading ? t("saving") : t("continue")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
