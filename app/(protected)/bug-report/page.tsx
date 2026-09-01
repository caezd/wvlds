import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { signBugReportAttachments } from "@/lib/bugReportAttachments";
import type { BugReport } from "@/lib/bugReports";
import { BugReportForm } from "@/components/support/BugReportForm";

export async function generateMetadata() {
  const t = await getTranslations("bugReport");
  return { title: t("title") };
}

/**
 * Page de signalement : le formulaire, puis les signalements déjà envoyés.
 *
 * Une page et non un modal — un modal impose sa hauteur, se referme au moindre
 * geste de côté et cohabite mal avec le clavier virtuel. Et c'est la liste qui
 * justifie la page : on y revient pour voir où en est ce qu'on a signalé.
 *
 * La liste n'a pas besoin de filtrer par utilisateur : la policy de lecture de
 * `bug_reports` ne rend que ses propres lignes — ou toutes, à un administrateur.
 * On filtre malgré tout sur `user_id`, pour qu'un administrateur voie ICI ses
 * propres signalements et non la file entière, qui a sa page.
 */
export default async function BugReportPage() {
  const t = await getTranslations("bugReport");
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data } = userId
    ? await supabase
        .from("bug_reports")
        .select("id, user_id, description, page_url, user_agent, app_version, status, admin_note, created_at, attachments")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null };

  const reports = (data ?? []) as BugReport[];
  const signées = await signBugReportAttachments(
    supabase,
    reports.flatMap((r) => r.attachments ?? []),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      <BugReportForm />

      {reports.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("mine")}</h2>
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-border-soft p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{report.description}</p>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {t(`status.${report.status}`)}
                  </span>
                </div>

                {(report.attachments ?? []).length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {(report.attachments ?? []).map((chemin) => {
                      const url = signées.get(chemin);
                      // Un chemin non signé est un chemin devenu illisible :
                      // on saute l'image plutôt que d'afficher un cadre cassé.
                      if (!url) return null;
                      return (
                        <li key={chemin} className="relative h-20 w-20 overflow-hidden rounded-lg border">
                          <Image src={url} alt="" fill unoptimized className="object-cover" />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
