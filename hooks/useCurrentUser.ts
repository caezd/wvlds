// L'implémentation vit désormais dans un Context (CurrentUserProvider) pour
// éviter que chaque composant refasse getUser() + select username.
// Ce ré-export préserve le chemin d'import `@/hooks/useCurrentUser`.
export { useCurrentUser } from "@/components/providers/CurrentUserProvider";
export type { CurrentUser } from "@/components/providers/CurrentUserProvider";
