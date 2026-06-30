import { createClient } from "@/lib/supabase/server";
import { Compass, ShoppingBasket, ShieldCheck, Dices, UserRound } from "lucide-react";
import { RailIcon } from "./SidebarRailIcons";
import { NotificationBellButton } from "@/components/notifications";
import { DmsToggleButton, PinnedDmAvatarsRail } from "@/components/dms";
import { UserMenuButton } from "./UserMenuButton";
import { WorldsRailButton } from "./WorldsRailButton";
import { getFeatureFlags } from "@/lib/featureFlags";
import { MobileMenuButton } from "./MobileMenuButton";
import { getTranslations } from "next-intl/server";

export default async function SidebarRail() {
  const supabase = await createClient();
  const t = await getTranslations("nav");
  const { data: { user } } = await supabase.auth.getUser();
  const featureFlags = await getFeatureFlags(supabase);

  let adminFlag = false;
  let profileData: { username: string | null; plan: string | null; avatar_url: string | null } | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, username, plan, avatar_url")
      .eq("id", user.id)
      .single();

    adminFlag = profile?.is_admin === true;
    profileData = profile
      ? { username: profile.username ?? null, plan: profile.plan ?? null, avatar_url: profile.avatar_url ?? null }
      : null;
  }

  return (
    <div className="flex flex-col items-center h-full w-full gap-4 lg:py-3">

      <div className="flex flex-col items-center w-full py-1.5">
        <MobileMenuButton />
      </div>


      {/* Navigation globale */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5">

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


      <footer className="flex flex-col items-center gap-4 w-full mt-auto">

        {/* Conversations épinglées */}
        <PinnedDmAvatarsRail />

        {/* Messages privés */}
        <DmsToggleButton />

        <div className="h-px w-9 my-2 bg-border" />

        {/* Notifications */}
        {featureFlags.notifications && <NotificationBellButton />}

        {/* Avatar / menu utilisateur */}
        {user && (
          <div className="flex flex-col items-center w-full px-1.5">
            <UserMenuButton
              variant="compact"
              userId={user.id}
              username={profileData?.username ?? null}
              email={user.email ?? ""}
              avatarUrl={profileData?.avatar_url ?? null}
              plan={profileData?.plan ?? null}
            />
          </div>
        )}

      </footer>

    </div>
  );
}
