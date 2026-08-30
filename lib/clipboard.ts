import { toast } from "sonner";

/**
 * Copie un texte dans le presse-papiers, avec retour à l'utilisateur.
 *
 * Ce corps existait en quatre exemplaires — trois copies littérales dans les
 * fichiers de message d'un salon (dont une renommée `copyDialogueColor`) et un
 * `try/catch` recopié à la main dans la fiche d'un persona. Les messages
 * restent à l'appelant : seule l'action est commune, le libellé dépend de ce
 * qu'on copie.
 *
 * `navigator.clipboard` échoue hors contexte sécurisé et quand l'utilisateur
 * refuse l'autorisation : d'où le `catch`, qui ne doit rien laisser passer en
 * silence.
 */
export async function copyToClipboard(
  text: string,
  successMessage: string,
  errorMessage: string,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
  }
}
