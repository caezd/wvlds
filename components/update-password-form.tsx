"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ERR_NON_AUTHENTIFIE, ERR_NOM_UTILISATEUR_PRIS } from "@/lib/actionErrors";
import { messageErreurAuth } from "@/lib/authErrors";
import { BirthDateFields } from "@/components/BirthDateFields";
import { UsernameField } from "@/components/auth/UsernameField";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";

export function UpdatePasswordForm() {
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [birthDateFilled, setBirthDateFilled] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const availability = useUsernameAvailability(username);
  // Compte invité (sans pseudo) : pseudo libre et date de naissance, comme à
  // l'inscription (migration 266).
  const accountReady =
    !needsUsername ||
    ((availability.status === "available" || availability.status === "error") && birthDate !== null);

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
      setError(t("errorPasswordsDoNotMatch"));
      return;
    }

    if (!accountReady) return;

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error(ERR_NON_AUTHENTIFIE);

      if (needsUsername) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ username })
          .eq("id", userData.user.id);
        if (profileError) {
          if (/unique|duplicate/i.test(profileError.message)) {
            throw new Error(ERR_NOM_UTILISATEUR_PRIS);
          }
          throw profileError;
        }
        const { error: birthError } = await supabase.rpc("set_my_birth_date", { p_birth_date: birthDate });
        if (birthError) throw birthError;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      router.push("/");
    } catch (error: unknown) {
      // `throw error` plus haut jette une erreur Supabase, dont `.message`
      // est le texte brut de PostgreSQL — il cite la table et la policy.
      // `messageErreurAuth` ne reconnaît que des codes — ceux de Supabase et
      // les nôtres ; tout le reste retombe sur un message générique traduit.
      setError(messageErreurAuth(error, t));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold md:text-2xl">
        {needsUsername ? t("updatePassword.finishTitle") : t("updatePassword.setTitle")}
      </h2>
      <p className="text-muted-foreground">
        {needsUsername ? t("updatePassword.finishDescription") : t("updatePassword.setDescription")}
      </p>
      <div className="my-4">
        <form onSubmit={handleSubmit}>
          {needsUsername && (
            <div className="mb-6 flex flex-col gap-6">
              <UsernameField id="username" value={username} onChange={setUsername} availability={availability} />
              <BirthDateFields
                labels={{
                  legend: t("birthDate.label"),
                  day: t("birthDate.day"),
                  month: t("birthDate.month"),
                  year: t("birthDate.year"),
                }}
                help={{ label: t("helpFor", { title: t("birthDate.label") }), text: t("birthDate.hint") }}
                error={birthDateFilled && birthDate === null ? t("birthDate.invalid") : null}
                onChange={(next, filled) => {
                  setBirthDate(next);
                  setBirthDateFilled(filled);
                }}
              />
            </div>
          )}
          <div className="mb-6 flex gap-3 flex-col">
            <Label htmlFor="password">{t("password")}</Label>
            <PasswordInput
              id="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="mb-6 flex gap-3 flex-col">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <PasswordInput
              id="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || !accountReady}>
            {isLoading ? t("updatePassword.saving") : t("updatePassword.save")}
          </Button>
        </form>
      </div>
    </>
  );
}
