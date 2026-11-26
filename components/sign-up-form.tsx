"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Label } from "@/components/ui/label";
import { BirthDateFields } from "@/components/BirthDateFields";
import { UsernameField } from "@/components/auth/UsernameField";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { messageErreurAuth } from "@/lib/authErrors";

/**
 * L'inscription (migration 266) : pseudo, vérifié en direct, et date de
 * naissance voyagent avec le compte (`options.data`) jusqu'à
 * `handle_new_user`, qui les range. Plus de pseudo à choisir après la
 * première connexion, sauf s'il a été pris entre-temps.
 */
export function SignUpForm() {
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [birthDateFilled, setBirthDateFilled] = useState(false);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const availability = useUsernameAvailability(username);

  // Une vérification impossible (base injoignable) ne bloque pas l'inscription :
  // un pseudo pris entre-temps est simplement redemandé après connexion.
  const usernameOk = availability.status === "available" || availability.status === "error";
  const canSubmit = usernameOk && birthDate !== null && !isLoading;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    if (password !== repeatPassword) {
      setError(t("errorPasswordsDoNotMatch"));
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await createClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/invite`,
          data: { username, birth_date: birthDate },
        },
      });
      if (error) throw error;
      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(messageErreurAuth(error, t));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold md:text-2xl">{t("signup")}</h2>
      <p className="text-muted-foreground">
        {t.rich("alreadyRegistered", {
          link: (chunks) => (
            <Link href="/auth/login" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div className="my-4">
        <form onSubmit={handleSignUp} className="flex flex-col gap-6">
          <UsernameField id="username" value={username} onChange={setUsername} availability={availability} />
          <div className="flex flex-col gap-3">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
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
          <div className="flex flex-col gap-3">
            <Label htmlFor="password">{t("password")}</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Label htmlFor="repeat-password">{t("confirmPassword")}</Label>
            <PasswordInput
              id="repeat-password"
              autoComplete="new-password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </div>
          {error && <p className="-mt-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isLoading ? t("signUpPending") : t("signUpSubmit")}
          </Button>
        </form>
      </div>
    </>
  );
}
