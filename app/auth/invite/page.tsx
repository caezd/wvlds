"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function InvitePage() {
  const t = useTranslations("auth");
  const router = useRouter();
  // Les messages de Supabase (anglais, techniques) vont au journal ; le
  // visiteur lit une seule phrase, dans sa langue.
  const [invalid, setInvalid] = useState(false);
  const fail = (detail: unknown) => {
    console.error("[invite]", detail);
    setInvalid(true);
  };

  useEffect(() => {
    const supabase = createClient();

    const handle = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      // Flux PKCE : confirmation d'inscription ordinaire (?code=)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          fail(error.message);
          return;
        }
        router.replace("/");
        return;
      }

      // Flux implicite : invitation par email (#access_token=...)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      const errorDescription = hashParams.get("error_description");

      if (errorDescription) {
        fail(errorDescription);
        return;
      }

      if (!access_token || !refresh_token) {
        fail("jetons absents");
        return;
      }

      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });

      if (error || !data.session) {
        fail(error?.message ?? "session absente");
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);

      // L'adhésion au monde ne se décide plus ici : ce bloc lisait le monde
      // et le rôle dans `user_metadata`, que Supabase laisse l'utilisateur
      // réécrire lui-même, et l'écriture dans `world_members` était de toute
      // façon refusée par la RLS — silencieusement, l'erreur n'étant pas lue.
      // L'invitation vit désormais en base (cf. app/actions/invite.ts) et
      // s'accepte depuis les notifications.
      router.replace("/auth/update-password");
    };

    void handle();
  }, [router]);

  if (invalid) {
    return (
      <div>
        <h2 className="text-xl font-semibold md:text-2xl text-destructive">{t("invite.invalidTitle")}</h2>
        <p className="text-muted-foreground mt-2">{t("invite.invalid")}</p>
        <a href="/auth/login" className="underline text-sm mt-4 inline-block">
          {t("backToSignin")}
        </a>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold md:text-2xl">{t("invite.checking")}</h2>
      <p className="text-muted-foreground mt-2">{t("invite.checkingDescription")}</p>
    </div>
  );
}
