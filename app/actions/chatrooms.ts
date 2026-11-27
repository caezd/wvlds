"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { ERR_NON_AUTHENTIFIE, ERR_NON_AUTORISE, ERR_VALEUR_NON_SUPPORTEE, echecEnregistrement } from "@/lib/actionErrors";
import { idSchema } from "@/lib/inputSchemas";

/** Taille d'une page de `storage.list`, et d'un lot de `storage.remove`. */
const PAGE = 1000;

/** Les dossiers d'un salon dans le stockage : son icône et sa bannière, puis les fichiers de ses messages. */
function chatroomFolders(chatId: string): { bucket: string; prefix: string }[] {
  return [
    { bucket: "chatrooms", prefix: `chatroom-${chatId}` },
    { bucket: "chat-media", prefix: chatId },
    { bucket: "chat-banners", prefix: chatId },
  ];
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Vide un dossier. Les noms sont tous relus avant d'effacer : effacer page
 * après page décalerait la pagination et en laisserait la moitié.
 */
async function emptyFolder(admin: AdminClient, bucket: string, prefix: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    const names = (data ?? []).map((f: { name: string }) => `${prefix}/${f.name}`);
    paths.push(...names);
    if (names.length < PAGE) break;
  }
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE));
    if (error) throw error;
  }
}

/**
 * Supprime un salon au complet : la ligne, et avec elle (cascades de la base,
 * migration 276) ses messages, lancers, ellipses, épingles, notifications… ;
 * puis ses fichiers.
 *
 * La suppression part sous l'identité de l'appelant : la policy
 * « chatrooms: managers delete » décide (créateur, ou `chatrooms.manage` dans
 * le monde), et une ligne non touchée vaut refus. Seuls les fichiers passent
 * ensuite par le `service_role` : les médias des messages appartiennent à
 * leurs auteurs, et le stockage ne laisse pas un tiers les effacer. Le salon
 * est déjà supprimé à ce stade : un échec sur les fichiers est journalisé,
 * sans revenir sur la suppression.
 */
export async function deleteChatroom(chatId: string): Promise<{ error?: string }> {
  if (!idSchema.safeParse(chatId).success) return { error: ERR_VALEUR_NON_SUPPORTEE };

  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: ERR_NON_AUTHENTIFIE };

  const { data, error } = await supabase.from("chatrooms").delete().eq("id", chatId).select("id");
  if (error) return { error: echecEnregistrement("deleteChatroom", error) };
  if (!Array.isArray(data) || data.length !== 1) return { error: ERR_NON_AUTORISE };

  const admin = createAdminClient();
  for (const { bucket, prefix } of chatroomFolders(chatId)) {
    try {
      await emptyFolder(admin, bucket, prefix);
    } catch (e: unknown) {
      console.error(`[deleteChatroom] fichiers ${bucket}/${prefix}`, e);
    }
  }
  return {};
}
