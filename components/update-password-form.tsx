"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

export function UpdatePasswordForm() {
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Le champ username n'est affiché que si le profil n'en a pas encore
  // (cas d'une invitation) — pas lors d'une simple réinitialisation.
  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userData.user.id)
        .single();
      setNeedsUsername(!profile?.username);
    };
    void check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    const trimmed = username.trim();
    if (needsUsername && !USERNAME_RE.test(trimmed)) {
      setError(
        "Le nom d'utilisateur doit contenir entre 3 et 32 caractères (lettres, chiffres, underscore)."
      );
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Session expirée.");

      if (needsUsername) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ username: trimmed })
          .eq("id", userData.user.id);
        if (profileError) {
          if (/unique|duplicate/i.test(profileError.message)) {
            throw new Error("Ce nom d'utilisateur est déjà pris.");
          }
          throw profileError;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      router.push("/");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold md:text-2xl">
        {needsUsername ? "Finaliser votre compte" : "Définir un mot de passe"}
      </h2>
      <p className="text-muted-foreground">
        {needsUsername
          ? "Choisissez un nom d'utilisateur et un mot de passe pour accéder à votre compte."
          : "Choisissez un mot de passe pour accéder à votre compte."}
      </p>
      <div className="my-4">
        <form onSubmit={handleSubmit}>
          {needsUsername && (
            <div className="mb-6 flex gap-3 flex-col">
              <Label htmlFor="username">Nom d&apos;utilisateur</Label>
              <Input
                id="username"
                type="text"
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]{3,32}"
                placeholder="mon_pseudo"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <div className="mb-6 flex gap-3 flex-col">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="mb-6 flex gap-3 flex-col">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <Input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </div>
    </>
  );
}
