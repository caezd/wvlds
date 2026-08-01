import { Compass, ShoppingBasket, ShieldCheck, Dices, UserRound } from "lucide-react";
import { RailIcon } from "./SidebarRailIcons";
import { NotificationBellButton } from "@/components/notifications";
import { DmsToggleButton, PinnedDmAvatarsRail } from "@/components/dms";
import { UserMenuButton } from "./UserMenuButton";
import { WorldsRailButton } from "./WorldsRailButton";
import { getCachedFeatureFlags, getCurrentProfile, getCurrentAuth } from "@/lib/currentRequest";
import { MobileMenuButton } from "./MobileMenuButton";
import { getTranslations } from "next-intl/server";
import { ScrollArea } from "@/components/ui/scroll-area";

export default async function SidebarRail() {
  // Tout est mémoïsé pour la requête (partagé avec les layouts).
  const [t, featureFlags, auth, profile] = await Promise.all([
    getTranslations("nav"),
    getCachedFeatureFlags(),
    getCurrentAuth(),
    getCurrentProfile(),
  ]);

  const adminFlag = profile?.is_admin === true;
  const profileData = profile
    ? { username: profile.username ?? null, plan: profile.plan ?? null, avatar_url: profile.avatar_url ?? null }
    : null;

  return (
    <div className="flex flex-col items-center h-full w-full gap-2 lg:py-2 min-h-0">

      <div className="flex flex-col items-center w-full shrink-0">
        <MobileMenuButton />
      </div>

      {/* Navigation globale */}
      <ScrollArea className="w-full flex-1 min-h-0">
        <div className="flex flex-col items-center gap-1 w-full">

          <WorldsRailButton />


          <RailIcon href="/p" label={t("personas")}>
            <UserRound size={17} />
          </RailIcon>

          {featureFlags.public_worlds && (
            <RailIcon href="/explore" label={t("explore")}>
              <Compass size={17} />
            </RailIcon>
          )}

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
            <RailIcon href="/admin" label={t("admin")}>
              <ShieldCheck size={17} />
            </RailIcon>
          )}
        </div>
      </ScrollArea>

      <footer className="flex flex-col items-center gap-4 w-full mt-auto shrink-0">

        {/* Conversations épinglées */}
        <PinnedDmAvatarsRail />

        {/* Messages privés */}
        <DmsToggleButton />

        <div className="h-px w-9 my-2 bg-border" />

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
