// Moteur du centre de recherche de messages (façon Discord).
//
// `chat_messages.content` est chiffré côté client (lib/crypto.ts) : la RPC
// `search_chat_messages` ne filtre donc jamais sur le texte, seulement sur
// les métadonnées (salon, auteur, date, épinglé, pièce jointe). Quand la
// recherche a besoin du texte (recherche libre, mentions, lien), ce module
// rappelle la RPC par lots successifs et déchiffre/filtre côté client —
// c'est le "scan progressif". Sinon ("fast path"), un seul appel RPC suffit
// et la page reçue est déjà le résultat final.
import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";
import { getChatroomKeys } from "@/lib/chatroomKeys";
import type { ChatMessageMeta } from "@/types/db";

export type AuthorMode = "persona" | "direct" | null;

export type SearchFilters = {
  chatIds?: string[];
  authorIds?: string[];
  personaIds?: string[];
  authorMode?: AuthorMode;
  hasMedia?: boolean | null;
  hasLink?: boolean | null;
  pinned?: boolean | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  freeText?: string;
  mentionsUsername?: string;
};

export type SearchResultMessage = {
  id: number;
  chatId: string;
  authorId: string | null;
  personaId: string | null;
  content: string;
  createdAt: string;
  metadata: ChatMessageMeta | null;
  pinned: boolean;
};

export type SearchCursor = { createdAt: string; id: number } | null;

export type SearchPage = {
  results: SearchResultMessage[];
  nextCursor: SearchCursor;
  hasMore: boolean;
  scannedThisCall: number;
};

const PAGE_SIZE = 25;
const SCAN_BATCH_SIZE = 150;
const SCAN_CAP = 2000;
const DECRYPT_CHUNK_SIZE = 25;

// Cache de session : une même recherche affinée (ajout d'un filtre après un
// scan) ne re-déchiffre pas les messages déjà vus.
const decryptedContentCache = new Map<number, string>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesFreeText(content: string, query: string): boolean {
  if (!query.trim()) return true;
  return content.toLowerCase().includes(query.trim().toLowerCase());
}

export function matchesMention(content: string, username: string): boolean {
  if (!username.trim()) return true;
  const re = new RegExp(`@${escapeRegExp(username.trim())}\\b`, "i");
  return re.test(content);
}

export function matchesLink(content: string): boolean {
  return /https?:\/\/\S+/i.test(content);
}

function needsClientScan(filters: SearchFilters): boolean {
  return Boolean(filters.freeText?.trim() || filters.mentionsUsername?.trim() || filters.hasLink);
}

/**
 * Vrai si au moins un filtre structuré (salon, auteur, mentions, contenu,
 * date, épinglé, type d'auteur) est actif — le texte libre seul ne compte
 * pas : on ne veut pas scanner tout l'historique sans aucune restriction.
 */
export function hasActiveFilter(filters: SearchFilters): boolean {
  return Boolean(
    filters.chatIds?.length ||
      filters.authorIds?.length ||
      filters.personaIds?.length ||
      filters.authorMode ||
      filters.hasMedia ||
      filters.hasLink ||
      (filters.pinned !== null && filters.pinned !== undefined) ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.mentionsUsername?.trim(),
  );
}

type RawSearchRow = {
  id: number;
  chat_id: string;
  author_id: string | null;
  persona_id: string | null;
  content: string;
  created_at: string;
  metadata: ChatMessageMeta | null;
  pinned: boolean;
};

async function fetchCandidatePage(
  supabase: SupabaseClient,
  worldId: string,
  filters: SearchFilters,
  cursor: SearchCursor,
  limit: number,
): Promise<RawSearchRow[]> {
  const { data, error } = await supabase.rpc(RPC.SEARCH_CHAT_MESSAGES, {
    p_world_id: worldId,
    p_chat_ids: filters.chatIds?.length ? filters.chatIds : null,
    p_author_ids: filters.authorIds?.length ? filters.authorIds : null,
    p_persona_ids: filters.personaIds?.length ? filters.personaIds : null,
    p_author_mode: filters.authorMode ?? null,
    p_has_media: filters.hasMedia ?? null,
    p_pinned: filters.pinned ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as RawSearchRow[];
}

async function decryptRows(
  supabase: SupabaseClient,
  rows: RawSearchRow[],
): Promise<SearchResultMessage[]> {
  const chatIds = [...new Set(rows.map((r) => r.chat_id))];
  const keys = await getChatroomKeys(supabase, chatIds);
  const out: SearchResultMessage[] = new Array(rows.length);

  for (let i = 0; i < rows.length; i += DECRYPT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + DECRYPT_CHUNK_SIZE);
    const decrypted = await Promise.all(
      chunk.map(async (row) => {
        const cached = decryptedContentCache.get(row.id);
        if (cached !== undefined) return cached;
        const key = keys.get(row.chat_id);
        const content = key ? await decryptMessage(row.content, key) : row.content;
        decryptedContentCache.set(row.id, content);
        return content;
      }),
    );
    chunk.forEach((row, idx) => {
      out[i + idx] = {
        id: row.id,
        chatId: row.chat_id,
        authorId: row.author_id,
        personaId: row.persona_id,
        content: decrypted[idx],
        createdAt: row.created_at,
        metadata: row.metadata,
        pinned: row.pinned,
      };
    });
  }
  return out;
}

function matchesTextPredicates(content: string, filters: SearchFilters): boolean {
  if (filters.freeText?.trim() && !matchesFreeText(content, filters.freeText)) return false;
  if (filters.mentionsUsername?.trim() && !matchesMention(content, filters.mentionsUsername)) return false;
  if (filters.hasLink && !matchesLink(content)) return false;
  return true;
}

function rowCursor(row: RawSearchRow): SearchCursor {
  return { createdAt: row.created_at, id: row.id };
}

/**
 * Renvoie la page suivante de résultats. `cursor` vaut `null` pour démarrer
 * une nouvelle recherche ; sinon, poursuit depuis le point atteint par
 * l'appel précédent (fast path : pagination normale ; scan : reprise du
 * balayage).
 */
export async function searchChatMessages(
  supabase: SupabaseClient,
  worldId: string,
  filters: SearchFilters,
  cursor: SearchCursor,
): Promise<SearchPage> {
  if (!needsClientScan(filters)) {
    const rows = await fetchCandidatePage(supabase, worldId, filters, cursor, PAGE_SIZE);
    const results = await decryptRows(supabase, rows);
    const last = rows.at(-1);
    return {
      results,
      nextCursor: rows.length === PAGE_SIZE && last ? rowCursor(last) : null,
      hasMore: rows.length === PAGE_SIZE,
      scannedThisCall: rows.length,
    };
  }

  const matches: SearchResultMessage[] = [];
  let scanCursor = cursor;
  let scannedThisCall = 0;
  let exhausted = false;

  while (matches.length < PAGE_SIZE && scannedThisCall < SCAN_CAP) {
    const rows = await fetchCandidatePage(supabase, worldId, filters, scanCursor, SCAN_BATCH_SIZE);
    scannedThisCall += rows.length;
    if (rows.length === 0) {
      exhausted = true;
      break;
    }
    const decrypted = await decryptRows(supabase, rows);
    for (const msg of decrypted) {
      if (matchesTextPredicates(msg.content, filters)) matches.push(msg);
      if (matches.length >= PAGE_SIZE) break;
    }
    scanCursor = rowCursor(rows.at(-1)!);
    if (rows.length < SCAN_BATCH_SIZE) {
      exhausted = true;
      break;
    }
  }

  return {
    results: matches.slice(0, PAGE_SIZE),
    nextCursor: exhausted ? null : scanCursor,
    hasMore: !exhausted,
    scannedThisCall,
  };
}
