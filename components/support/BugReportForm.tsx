"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  lireErreursClient,
  oublierErreursClient,
  type ErreurClient,
} from "@/lib/clientErrorLog";

type Jointe = {
  aperçu: string;
  /**
   * La conversion, lancée dès la sélection.
   *
   * On garde la promesse plutôt que son résultat : l'attendre à l'envoi coûte
   * alors zéro si elle est finie — ce qui est le cas dès qu'on a pris le temps
   * d'écrire une phrase — et seulement le reste sinon. La faire au clic
   * ajoutait trois conversions à l'attente, sur un formulaire pensé pour le
   * téléphone.
   */
  conversion: Promise<File>;
};

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

  // Le journal vit dans `sessionStorage`, hors d'atteinte du rendu serveur : le
  // lire à l'affichage plutôt qu'à l'initialisation de l'état évite que le
  // premier rendu client diffère de celui du serveur.
  const [erreurs, setErreurs] = React.useState<ErreurClient[]>([]);
  const [joindreErreurs, setJoindreErreurs] = React.useState(true);
  React.useEffect(() => setErreurs(lireErreursClient()), []);

  // Les aperçus sont des URL d'objet : sans révocation, chaque image choisie
  // laisse un blob en mémoire jusqu'au rechargement de la page.
  React.useEffect(() => {
    return () => jointes.forEach((j) => URL.revokeObjectURL(j.aperçu));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tropLong = description.length > BUG_REPORT_MAX_LENGTH;
  const envoyable = description.trim().length > 0 && !tropLong && !envoi;
  const placeRestante = BUG_REPORT_MAX_ATTACHMENTS - jointes.length;

  /**
   * Convertit sans jamais échouer : le fichier d'origine est déjà d'un type
   * accepté par le bucket (migration 140). Une conversion ratée ne doit pas
   * coûter son signalement à quelqu'un — ni, en remontant, laisser `envoi`
   * bloqué sur une exception que personne ne rattrape.
   */
  function convertir(fichier: File): Promise<File> {
    return toWebP(fichier).catch(() => fichier);
  }

  function ajouterFichiers(fichiers: FileList | null) {
    if (!fichiers) return;
    const images = [...fichiers]
      .filter((f) => (BUG_REPORT_IMAGE_TYPES as readonly string[]).includes(f.type))
      .slice(0, placeRestante);
    setJointes((prev) => [
      ...prev,
      ...images.map((f) => ({ aperçu: URL.createObjectURL(f), conversion: convertir(f) })),
    ]);
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

  /**
   * Dépose les images et rend leurs chemins, ou rien si l'une a échoué.
   *
   * En parallèle : trois dépôts enchaînés, c'était trois allers-retours l'un
   * après l'autre pendant que le bouton restait figé. Un dépôt raté annule
   * l'envoi — un rapport ne doit pas référencer une image absente — et ceux qui
   * ont abouti deviennent des orphelins, que le nettoyage de la file de tri
   * ramasse.
   */
  async function déposerImages(userId: string): Promise<string[] | null> {
    const dépôts = await Promise.all(
      jointes.map(async ({ conversion }) => {
        const converti = await conversion;
        const chemin = `user-${userId}/${nomDeFichierPourType(converti.type)}`;
        const { error } = await supabase.storage
          .from(BUG_REPORT_BUCKET)
          .upload(chemin, converti, { contentType: converti.type });
        return { chemin, error };
      }),
    );

    const raté = dépôts.find((d) => d.error);
    if (raté) {
      toast.error(raté.error!.message);
      return null;
    }
    return dépôts.map((d) => d.chemin);
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
      clientErrors: joindreErreurs ? erreurs : [],
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
    // Vidé une fois parti : sans ça, un second signalement emporterait de
    // nouveau les erreurs du premier, et l'on croirait à une récidive.
    oublierErreursClient();
    setErreurs([]);
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

      {/* Le journal d'erreurs est MONTRÉ, jamais seulement annoncé : une pile
          d'appels contient des adresses de pages, parfois un fragment de ce qui
          était à l'écran. On ne joint pas ça au nom de quelqu'un sans qu'il
          l'ait lu, ni sans qu'il puisse s'y opposer. */}
      {erreurs.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border-soft p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="bug-report-errors"
              checked={joindreErreurs}
              onCheckedChange={(v) => setJoindreErreurs(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="bug-report-errors" className="text-sm font-normal leading-snug">
              {t("attachErrors", { count: erreurs.length })}
            </Label>
          </div>

          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {erreurs.map((e) => (
              <li key={`${e.at}-${e.message}`} className="text-xs leading-snug">
                <p className="break-words font-mono text-muted-foreground">{e.message}</p>
                {e.source && (
                  <p className="break-all font-mono text-[0.65rem] text-muted-foreground/70">
                    {e.source}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button type="submit" disabled={!envoyable}>
        {envoi ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
