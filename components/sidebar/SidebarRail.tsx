import { cookies } from "next/headers";
import { ShoppingBasket, ShieldCheck, Dices, UserRound, Compass } from "lucide-react";
import { RailIcon } from "./SidebarRailIcons";
import { WorldsQuickAccess } from "./WorldsQuickAccess";
import { NotificationBellButton } from "@/components/notifications";
import { DmsToggleButton, PinnedDmAvatarsRail } from "@/components/dms";
import { UserMenuButton } from "./UserMenuButton";
import { getCachedFeatureFlags, getCurrentProfile, getCurrentAuth, getFavoriteWorlds, getNewBugReportCount } from "@/lib/currentRequest";
import { SidebarLogo } from "./SidebarLogo";
import { getTranslations } from "next-intl/server";
import { ScrollArea } from "@/components/ui/scroll-area";

export default async function SidebarRail() {
  // Tout est mémoïsé pour la requête (partagé avec les layouts).
  const [t, featureFlags, auth, profile, favoriteWorlds, cookieStore] = await Promise.all([
    getTranslations("nav"),
    getCachedFeatureFlags(),
    getCurrentAuth(),
    getCurrentProfile(),
    getFavoriteWorlds(),
    cookies(),
  ]);
  // Dernier monde visité (même cookie que app/page.tsx) — lien direct du
  // bouton "Mondes" vers `/w/<id>` plutôt que `/w` (qui repasse par `/` pour
  // la résolution). Pas de revérification d'appartenance ici : la page cible
  // s'en charge déjà (notFound() si on a quitté ce monde entre-temps).
  const lastWorldId = cookieStore.get("last_world_id")?.value ?? null;

  const adminFlag = profile?.is_admin === true;
  // Après `getCurrentProfile` et non dans le `Promise.all` ci-dessus : le
  // comptage n'a de sens que pour un administrateur, et le demander pour tout
  // le monde ajouterait une requête sur chaque page protégée.
  const signalementsATrier = adminFlag ? await getNewBugReportCount() : 0;
  const profileData = profile
    ? { username: profile.username ?? null, plan: profile.plan ?? null, avatar_url: profile.avatar_url ?? null }
    : null;

  return (
    <div className="flex flex-col items-center h-full w-full gap-2 lg:py-2 min-h-0">

      <div className="flex flex-col items-center w-full shrink-0">
        <SidebarLogo />
      </div>

      {/* Navigation globale */}
      <ScrollArea className="w-full flex-1 min-h-0">
        <div className="flex flex-col items-center gap-1 w-full">

          <WorldsQuickAccess worlds={favoriteWorlds} label={t("worlds")} lastWorldId={lastWorldId} />

          {featureFlags.public_worlds && (
            <RailIcon href="/explore" label={t("explore")}>
              <Compass size={17} />
            </RailIcon>
          )}

          <RailIcon href="/p" label={t("personas")}>
            <UserRound size={17} />
          </RailIcon>

          {featureFlags.quests && (
            <RailIcon href="/quests" label={t("quests")}>
              <Dices size={17} />
            </RailIcon>
          )}
          {featureFlags.shop && (
            <RailIcon href="/shop" label={t("shop")}>
              <ShoppingBasket size={17} />
            </RailIcon>
          )}
          {adminFlag && (
            <RailIcon
              href="/admin"
              label={t("admin")}
              badge={signalementsATrier}
              badgeLabel={t("bugReportsToTriage", { count: signalementsATrier })}
            >
              <ShieldCheck size={17} />
            </RailIcon>
          )}
        </div>
      </ScrollArea>

      <footer className="flex flex-col items-center gap-1.5 w-full mt-auto shrink-0">

        {/* Conversations épinglées + messages privés */}
        {featureFlags.direct_messages && (
          <>
            <PinnedDmAvatarsRail />
            <DmsToggleButton />
          </>
        )}

        <div className="my-0.5 h-px w-8 shrink-0 bg-border-soft" />

        {/* Notifications */}
        {featureFlags.notifications && <NotificationBellButton />}

        {/* Avatar / menu utilisateur */}
        {auth && (
          <div className="flex flex-col items-center w-full px-1.5">
            <UserMenuButton
              variant="compact"
              userId={auth.id}
              username={profileData?.username ?? null}
              email={auth.email ?? ""}
              avatarUrl={profileData?.avatar_url ?? null}
              plan={profileData?.plan ?? null}
            />
          </div>
        )}

      </footer>

    </div>
  );
}
