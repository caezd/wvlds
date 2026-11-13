import type { WorldMemberCardFields } from "@/lib/worldMembers";
import type { WorldMemberStatus } from "@/types/db";

// La carte d'un membre telle que le formulaire l'édite (des chaînes, « vide »
// pour ce qui n'est pas choisi), et l'écriture qu'on en tire. Partagé entre le
// formulaire (dialogue de statut d'un gestionnaire) et le brouillon de « Mon
// profil », pour qu'ils appliquent les mêmes règles.

/** La valeur « rien de choisi » d'un `Select` (Radix refuse la chaîne vide). */
export const CARD_NONE = "__none__";

export type CardDraft = {
  status: WorldMemberStatus;
  statusUntil: string;
  statusNote: string;
  bio: string;
  availability: string;
  timezone: string;
  birthdayDay: string;
  birthdayMonth: string;
};

export function cardDraftFrom(card: WorldMemberCardFields): CardDraft {
  return {
    status: card.status,
    statusUntil: card.status_until ?? "",
    statusNote: card.status_note ?? "",
    bio: card.bio ?? "",
    availability: card.availability ?? "",
    timezone: card.timezone ?? CARD_NONE,
    birthdayDay: card.birthday_day ? String(card.birthday_day) : CARD_NONE,
    birthdayMonth: card.birthday_month ? String(card.birthday_month) : CARD_NONE,
  };
}

/** Un seul des deux champs de l'anniversaire : la base refuserait, l'UI bloque. */
export function birthdayPartial(d: Pick<CardDraft, "birthdayDay" | "birthdayMonth">): boolean {
  return (d.birthdayDay !== CARD_NONE) !== (d.birthdayMonth !== CARD_NONE);
}

/**
 * L'écriture sur `world_members` : textes nettoyés (`trim() || null`), retour
 * et mot effacés pour un membre actif, anniversaire effacé s'il est incomplet.
 * En mode `status` (un gestionnaire), rien d'autre que le statut — le
 * déclencheur `tg_world_members_guard` refuserait le reste.
 */
export function buildCardPatch(d: CardDraft, mode: "self" | "status"): Partial<WorldMemberCardFields> {
  const status = {
    status: d.status,
    status_until: d.status === "active" || !d.statusUntil ? null : d.statusUntil,
    status_note: d.status === "active" || !d.statusNote.trim() ? null : d.statusNote.trim(),
  };
  if (mode === "status") return status;
  const complete = d.birthdayDay !== CARD_NONE && d.birthdayMonth !== CARD_NONE;
  return {
    ...status,
    bio: d.bio.trim() || null,
    availability: d.availability.trim() || null,
    timezone: d.timezone === CARD_NONE ? null : d.timezone,
    birthday_month: complete ? Number(d.birthdayMonth) : null,
    birthday_day: complete ? Number(d.birthdayDay) : null,
  };
}

/** Deux brouillons qui donneraient la même écriture. */
export function sameCard(a: CardDraft, b: CardDraft, mode: "self" | "status" = "self"): boolean {
  return JSON.stringify(buildCardPatch(a, mode)) === JSON.stringify(buildCardPatch(b, mode));
}
