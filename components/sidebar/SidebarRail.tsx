import { createClient } from "@/lib/supabase/server";
import { Users, ShoppingBasket, ShieldCheck } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { RailIcon, WorldIcon, EmptyWorldsIcon } from "./SidebarRailIcons";

export default async function SidebarRail() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let worlds: { id: string; name: string }[] = [];
  let adminFlag = false;

  if (user) {
    const [{ data: worldData }, { data: profile }] = await Promise.all([
      supabase.from("worlds").select("id, name").order("name"),
      supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    ]);
    worlds = worldData ?? [];
    adminFlag = profile?.is_admin === true;
  }

  return (
    <div className="flex flex-col items-center h-full w-full gap-0.5">

      {/* ── 1. Navigation ──────────────────────────────── */}
      <div className="flex flex-col items-center gap-0.5 w-full pt-1 pb-0.5 px-1.5">
        <RailIcon href="/p" label="Personae">
          <Users size={17} />
        </RailIcon>
        <RailIcon href="/shop" label="Boutique">
          <ShoppingBasket size={17} />
        </RailIcon>
        {adminFlag && (
          <RailIcon href="/admin" label="Administration">
            <ShieldCheck size={17} />
          </RailIcon>
        )}
      </div>

      {/* ── 2. Séparateur ──────────────────────────────── */}
      <div className="w-6 border-t border-border-soft my-1 shrink-0" />

      {/* ── 3. Mondes (flex-1, scrollable) ─────────────── */}
      <div className="flex flex-col items-center gap-0.5 overflow-y-auto flex-1 w-full px-1.5 [scrollbar-width:none]">
        {worlds.map((w) => (
          <WorldIcon key={w.id} id={w.id} name={w.name} />
        ))}
        {worlds.length === 0 && <EmptyWorldsIcon />}
      </div>

      {/* ── 4. Footer ──────────────────────────────────── */}
      <div className="w-6 border-t border-border-soft my-1 shrink-0" />
      <div className="flex h-10 w-full items-center justify-center shrink-0 pb-1">
        <ThemeSwitcher />
      </div>

    </div>
  );
}
