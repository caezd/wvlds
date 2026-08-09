"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronsUpDown, KeyRound, LogOut, Scale, ScrollText, Settings, UserRound } from "lucide-react";
import { useGlobalPresence, type PresenceStatus } from "@/components/providers/PresenceProvider";
import { cn } from "@/lib/utils";
import { UserProfileSheet } from "./UserProfileSheet";
import { useTranslations } from "next-intl";

type UserMenuButtonProps = {
  userId: string;
  username: string | null;
  email: string;
  avatarUrl?: string | null;
  plan?: string | null;
  variant?: "full" | "compact";
};

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  invisible: "bg-muted-foreground/40 border border-muted-foreground",
};

function StatusDot({ status, className }: { status: PresenceStatus; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", STATUS_COLOR[status], className)} />;
}

export function UserMenuButton({
  userId,
  username,
  email,
  avatarUrl,
  plan,
  variant = "full",
}: UserMenuButtonProps) {
  const router = useRouter();
  const supabase = createClient();
  const { status, setStatus } = useGlobalPresence();
  const [profileOpen, setProfileOpen] = useState(false);
  const tPresence = useTranslations("presence");
  const tNav = useTranslations("nav");

  const STATUSES: { key: PresenceStatus; label: string }[] = [
    { key: "online",    label: tPresence("online") },
    { key: "offline",   label: tPresence("offline") },
    { key: "invisible", label: tPresence("invisible") },
  ];

  const displayName = username || email;
  const initials = (username || email).slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <>
      <UserProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        userId={userId}
        initialUsername={username}
        initialAvatarUrl={avatarUrl ?? null}
        email={email}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "compact" ? (
            <button
              aria-label="Menu du compte"
              className="flex h-9 w-9 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9 rounded-full">
                  <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
                  <AvatarFallback className="rounded-full text-xs bg-muted text-muted-foreground">{initials}</AvatarFallback>
                </Avatar>
                <StatusDot status={status} className="absolute bottom-0 right-0 ring-2 ring-background rounded-full" />
              </div>
            </button>
          ) : (
            <button className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9 rounded-lg">
                  <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
                  <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
                </Avatar>
                <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background rounded-full" />
              </div>
              <div className="grid flex-1 min-w-0 text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{plan ?? email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={variant === "compact" ? "bottom" : "top"}
          align={variant === "compact" ? "end" : "start"}
          className="w-56"
        >
          {/* En-tête avec sous-menu statut */}
          <DropdownMenuLabel className="font-normal p-0">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 rounded-sm px-2 py-1.5 w-full">
                <div className="relative shrink-0">
                  <Avatar className="h-8 w-8 rounded-full">
                    <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
                    <AvatarFallback className="rounded-full text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <StatusDot status={status} className="absolute bottom-0 right-0 ring-2 ring-popover rounded-full" />
                </div>
                <div className="grid min-w-0 text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{tPresence("changeStatus")}</span>
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {STATUSES.map(({ key, label }) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => {
                      if (key === status) return;
                      void setStatus(key).then((ok) => { if (ok) toast.success(label); });
                    }}
                    className="flex items-center gap-2"
                  >
                    <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_COLOR[key])} />
                    <span className={cn(status === key && "font-medium")}>{label}</span>
                    {status === key && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <UserRound className="mr-2 size-4" />
            {tNav("profile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings className="mr-2 size-4" />
            {tNav("settings")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/auth/update-password")}>
            <KeyRound className="mr-2 size-4" />
            {tNav("password")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/changelog")}>
            <ScrollText className="mr-2 size-4" />
            {tNav("changelog")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/legal")}>
            <Scale className="mr-2 size-4" />
            {tNav("legal")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 size-4" />
            {tNav("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
