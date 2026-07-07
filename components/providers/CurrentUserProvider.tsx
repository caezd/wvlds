"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  asMessageFont,
  asMessageTextSize,
  type MessageFont,
  type MessageTextSize,
} from "@/lib/messagePreferences";

export type { MessageFont, MessageTextSize };

export type CurrentUser = {
  user: User | null;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  appearOffline: boolean;
  plan: string | null;
  messageFont: MessageFont;
  messageTextSize: MessageTextSize;
  loading: boolean;
};

/** Données initiales fournies par le serveur (layout racine). */
export type InitialUser = {
  id: string;
  username: string | null;
  avatarUrl?: string | null;
  appearOffline?: boolean;
  plan?: string | null;
  messageFont?: MessageFont;
  messageTextSize?: MessageTextSize;
} | null;

const NEUTRAL: CurrentUser = {
  user: null,
  userId: null,
  username: null,
  avatarUrl: null,
  appearOffline: false,
  plan: null,
  messageFont: "sans",
  messageTextSize: "base",
  loading: false,
};

const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * Identité du profil courant, partagée par contexte.
 *
 * Avant, ce hook refaisait `auth.getUser()` + un `select` sur `profiles` DANS
 * CHAQUE composant consommateur (~20 montés simultanément), d'où les 6×
 * `/auth/v1/user` et les multiples `/profiles?select=…` identiques (username,
 * username+avatar_url, …+appear_offline, plan) observés sur un seul chargement.
 * Désormais le profil est résolu une seule fois (idéalement par le serveur) et
 * diffusé à tout l'arbre — un seul jeu de champs pour tous.
 */
export function useCurrentUser(): CurrentUser {
  const ctx = useContext(CurrentUserContext);
  // Hors provider (tests isolés, Storybook…) : valeurs neutres plutôt que crash.
  return ctx ?? NEUTRAL;
}

export function CurrentUserProvider({
  initialUser = null,
  children,
}: {
  initialUser?: InitialUser;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(initialUser?.username ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser?.avatarUrl ?? null);
  const [appearOffline, setAppearOffline] = useState<boolean>(initialUser?.appearOffline ?? false);
  const [plan, setPlan] = useState<string | null>(initialUser?.plan ?? null);
  const [messageFont, setMessageFont] = useState<MessageFont>(initialUser?.messageFont ?? "sans");
  const [messageTextSize, setMessageTextSize] = useState<MessageTextSize>(
    initialUser?.messageTextSize ?? "base",
  );
  // Le serveur a déjà validé la session (layout protégé). Si initialUser est
  // fourni, on démarre prêt — aucun getUser() réseau au boot.
  const [loading, setLoading] = useState(initialUser === null);
  // Passe à true dès le premier événement d'auth client : à partir de là, le
  // client fait foi (on ne retombe plus sur initialUser, ex. après déconnexion).
  const [resolved, setResolved] = useState(false);

  // Évite un fetch de profil redondant quand le serveur l'a déjà fourni.
  const hasProfileRef = useRef(initialUser !== null);

  // Le provider racine n'est jamais remonté entre deux navigations : après un
  // router.refresh() (ex. changement de police dans les réglages), seule cette
  // synchronisation permet à `messageFont` de refléter le nouveau profil serveur.
  useEffect(() => {
    if (initialUser?.messageFont) setMessageFont(initialUser.messageFont);
  }, [initialUser?.messageFont]);

  useEffect(() => {
    if (initialUser?.messageTextSize) setMessageTextSize(initialUser.messageTextSize);
  }, [initialUser?.messageTextSize]);

  useEffect(() => {
    // `onAuthStateChange` émet INITIAL_SESSION (lecture du storage local, sans
    // requête réseau) puis les transitions (refresh, login, logout). On évite
    // ainsi le `getUser()` réseau au démarrage : une requête /auth/v1/user
    // économisée par consommateur.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);
      setResolved(true);

      if (!u) {
        hasProfileRef.current = false;
        setUsername(null);
        setAvatarUrl(null);
        setAppearOffline(false);
        setPlan(null);
        setMessageFont("sans");
        setMessageTextSize("base");
        return;
      }

      // Profil déjà fourni par le serveur → aucune requête profiles.
      // Fallback ponctuel (un seul select groupé) si absent (login client pur).
      if (!hasProfileRef.current) {
        supabase
          .from("profiles")
          .select("username, avatar_url, appear_offline, plan, message_font, message_text_size")
          .eq("id", u.id)
          .single()
          .then(
            ({
              data,
            }: {
              data: {
                username: string | null;
                avatar_url: string | null;
                appear_offline: boolean | null;
                plan: string | null;
                message_font: string | null;
                message_text_size: string | null;
              } | null;
            }) => {
              hasProfileRef.current = true;
              setUsername(data?.username ?? null);
              setAvatarUrl(data?.avatar_url ?? null);
              setAppearOffline(!!data?.appear_offline);
              setPlan(data?.plan ?? null);
              setMessageFont(asMessageFont(data?.message_font));
              setMessageTextSize(asMessageTextSize(data?.message_text_size));
            },
          );
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<CurrentUser>(
    () => ({
      user,
      // Avant le 1er événement client : identité serveur. Après : le client fait foi.
      userId: resolved ? user?.id ?? null : initialUser?.id ?? null,
      username,
      avatarUrl,
      appearOffline,
      plan,
      messageFont,
      messageTextSize,
      loading,
    }),
    [
      user,
      username,
      avatarUrl,
      appearOffline,
      plan,
      messageFont,
      messageTextSize,
      loading,
      resolved,
      initialUser?.id,
    ],
  );

  return (
    <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
  );
}
