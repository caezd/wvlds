"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cleanBugReportAttachments } from "@/app/actions/bugReports";
import { messageErreurAction } from "@/lib/actionErrors";

/**
 * Supprime les images déposées qui n'ont jamais accompagné de rapport.
 *
 * Déclenché à la main plutôt que périodiquement : un nettoyage automatique
 * demanderait une tâche planifiée, donc une décision d'infrastructure. Le
 * plafond horaire de la migration 147 borne déjà l'accumulation, et rien ne
 * presse — ces fichiers ne coûtent que de l'espace.
 */
export function CleanAttachmentsButton() {
  const t = useTranslations("admin.bugReports");
  const tCommon = useTranslations("common");
  const [enCours, setEnCours] = React.useState(false);

  async function nettoyer() {
    setEnCours(true);
    const res = await cleanBugReportAttachments();
    setEnCours(false);

    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    // Un nettoyage qui n'a rien trouvé mérite de le dire : sans retour, on ne
    // saurait pas distinguer « rien à faire » d'un bouton qui ne marche pas.
    toast.success(t("cleaned", { count: res.removed }));
  }

  return (
    <Button variant="outline" size="sm" disabled={enCours} onClick={() => void nettoyer()}>
      <Eraser className="mr-1.5 h-4 w-4" />
      {enCours ? t("cleaning") : t("clean")}
    </Button>
  );
}
