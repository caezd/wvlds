"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";
import { nomDeFichierPourType } from "@/lib/storagePaths";
import { submitBugReport } from "@/app/actions/bugReports";
import { messageErreurAction } from "@/lib/actionErrors";
import {
  BUG_REPORT_BUCKET,
  BUG_REPORT_IMAGE_TYPES,
  BUG_REPORT_MAX_ATTACHMENTS,
  BUG_REPORT_MAX_LENGTH,
  bugReportContext,
} from "@/lib/bugReports";

type Jointe = { fichier: File; aperçu: string };

/**
 * Formulaire de signalement — une page, pas un modal.
 *
 * Un modal impose sa hauteur, se referme au moindre geste de côté et cohabite
 * mal avec le clavier virtuel : exactement ce qu'il ne faut pas pour un
 * formulaire où l'on écrit longuement depuis un téléphone, en joignant des
 * captures.
 *
 * Les images partent vers le stockage AVANT l'envoi du rapport, puis seuls
 * leurs chemins accompagnent celui-ci. C'est ce qui permet au bucket d'être
 * privé : le serveur n'a jamais à relayer les octets, et une image déposée
 * reste illisible sans URL signée.
 */
export function BugReportForm({
  pageSignalee,
}: {
  /**
   * La page d'où l'on vient, retenue par le menu au moment où on l'a quittée.
   *
   * Le formulaire ne peut pas la deviner : sur une page dédiée,
   * `window.location` ne désigne plus que le formulaire lui-même. Elle vaut
   * donc `null` pour qui arrive ici directement — auquel cas rien n'est joint
   * plutôt qu'une page fausse.
   */
  pageSignalee?: string | null;
}) {
  const t = useTranslations("bugReport");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [description, setDescription] = React.useState("");
  const [jointes, setJointes] = React.useState<Jointe[]>([]);
  const [envoi, setEnvoi] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Les aperçus sont des URL d'objet : sans révocation, chaque image choisie
  // laisse un blob en mémoire jusqu'au rechargement de la page.
  React.useEffect(() => {
    return () => jointes.forEach((j) => URL.revokeObjectURL(j.aperçu));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tropLong = description.length > BUG_REPORT_MAX_LENGTH;
  const envoyable = description.trim().length > 0 && !tropLong && !envoi;
  const placeRestante = BUG_REPORT_MAX_ATTACHMENTS - jointes.length;

  function ajouterFichiers(fichiers: FileList | null) {
    if (!fichiers) return;
    const images = [...fichiers]
      .filter((f) => (BUG_REPORT_IMAGE_TYPES as readonly string[]).includes(f.type))
      .slice(0, placeRestante);
    setJointes((prev) => [...prev, ...images.map((f) => ({ fichier: f, aperçu: URL.createObjectURL(f) }))]);
    // Sans ça, rechoisir le même fichier après l'avoir retiré n'émet aucun
    // `change` — la valeur de l'input n'ayant pas varié.
    if (inputRef.current) inputRef.current.value = "";
  }

  function retirer(index: number) {
    setJointes((prev) => {
      URL.revokeObjectURL(prev[index].aperçu);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function déposerImages(userId: string): Promise<string[] | null> {
    const chemins: string[] = [];
    for (const { fichier } of jointes) {
      const converti = await toWebP(fichier);
      const chemin = `user-${userId}/${nomDeFichierPourType(converti.type)}`;
      const { error } = await supabase.storage
        .from(BUG_REPORT_BUCKET)
        .upload(chemin, converti, { contentType: converti.type });
      if (error) {
        toast.error(error.message);
        return null;
      }
      chemins.push(chemin);
    }
    return chemins;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!envoyable) return;
    setEnvoi(true);

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setEnvoi(false);
      toast.error(tCommon("sessionExpired"));
      return;
    }

    const chemins = await déposerImages(userId);
    if (!chemins) {
      setEnvoi(false);
      return;
    }

    const res = await submitBugReport({
      description,
      attachments: chemins,
      ...bugReportContext(pageSignalee),
    });
    setEnvoi(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }

    setDescription("");
    jointes.forEach((j) => URL.revokeObjectURL(j.aperçu));
    setJointes([]);
    toast.success(t("sent"));
    // La liste « mes signalements » est rendue côté serveur : sans ce
    // rafraîchissement, le rapport qu'on vient d'envoyer n'y apparaîtrait pas.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="bug-report-description">{t("descriptionLabel")}</Label>
        <AutoResizeTextarea
          id="bug-report-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          minRows={6}
          maxRows={24}
          aria-invalid={tropLong}
          className="w-full resize-none rounded-md border bg-transparent p-3 text-sm outline-none"
        />
        <p className={cn("text-xs", tropLong ? "text-destructive" : "text-muted-foreground")}>
          {tropLong
            ? t("tooLong", { max: BUG_REPORT_MAX_LENGTH })
            : `${description.length} / ${BUG_REPORT_MAX_LENGTH}`}
        </p>
      </div>

      <div className="space-y-2">
        {/* Associé au champ de fichiers, qui est masqué visuellement mais
            reste le contrôle réel : sans `htmlFor`, ce libellé ne libelle rien
            et le champ n'a aucun nom accessible. */}
        <Label htmlFor="bug-report-images">{t("imagesLabel")}</Label>
        <p className="text-xs leading-snug text-muted-foreground">
          {t("imagesHint", { max: BUG_REPORT_MAX_ATTACHMENTS })}
        </p>

        {jointes.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {jointes.map((j, i) => (
              <li key={j.aperçu} className="relative h-24 w-24 overflow-hidden rounded-lg border">
                <Image src={j.aperçu} alt="" fill unoptimized className="object-cover" />
                <button
                  type="button"
                  onClick={() => retirer(i)}
                  aria-label={tCommon("remove")}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={BUG_REPORT_IMAGE_TYPES.join(",")}
          multiple
          className="sr-only"
          id="bug-report-images"
          onChange={(e) => ajouterFichiers(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={placeRestante <= 0 || envoi}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="mr-1.5 h-4 w-4" />
          {t("addImage")}
        </Button>
      </div>

      {/* Ce qui part avec le rapport, dit avant l'envoi — et la page nommée
          plutôt qu'annoncée : c'est le seul moyen de voir qu'on signale la
          bonne, ou qu'aucune n'accompagne le message. */}
      <div className="space-y-1 text-xs leading-snug text-muted-foreground">
        {pageSignalee ? (
          <p>
            {t("reportedPage")} <code className="break-all font-mono">{pageSignalee}</code>
          </p>
        ) : (
          <p>{t("noReportedPage")}</p>
        )}
        <p>{t("attached")}</p>
      </div>

      <Button type="submit" disabled={!envoyable}>
        {envoi ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
