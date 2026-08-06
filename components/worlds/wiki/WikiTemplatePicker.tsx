"use client";

import { useTranslations } from "next-intl";
import { LayoutTemplate } from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WIKI_TEMPLATE_ICONS, WIKI_TEMPLATE_IDS, type WikiTemplateId } from "@/lib/wikiTemplates";

/** Choix d'un modèle de départ à la création d'une page (contenu pré-rempli en brouillon). */
export function WikiTemplatePicker({
  value,
  onChange,
}: {
  value: WikiTemplateId | null;
  onChange: (id: WikiTemplateId | null) => void;
}) {
  const t = useTranslations("wiki.templates");
  const label = value ? t(`${value}.label`) : t("blank");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t("pickerLabel")}
        >
          <LayoutTemplate className="h-3 w-3" />
          <span className="max-w-[7rem] truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange(null)}>
          {t("blank")}
        </DropdownMenuItem>
        {WIKI_TEMPLATE_IDS.map(id => (
          <DropdownMenuItem key={id} onClick={() => onChange(id)}>
            <LazyLucideIcon name={WIKI_TEMPLATE_ICONS[id]} className="mr-2 h-4 w-4" />
            {t(`${id}.label`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
