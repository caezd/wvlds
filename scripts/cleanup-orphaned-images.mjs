/**
 * Script ponctuel — supprime les fichiers section-images orphelins du bucket 'personas'.
 * Usage : node scripts/cleanup-orphaned-images.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service role pour bypass RLS
);

const BUCKET = "personas";

async function listAll(prefix) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  return data ?? [];
}

async function deletePaths(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

async function cleanFolder(prefix) {
  const items = await listAll(prefix);
  const files = items.filter((i) => i.id); // fichiers (pas dossiers)
  const folders = items.filter((i) => !i.id);

  const filePaths = files.map((f) => `${prefix}/${f.name}`);
  if (filePaths.length) {
    console.log(`Suppression de ${filePaths.length} fichier(s) dans ${prefix}/`);
    await deletePaths(filePaths);
  }

  for (const folder of folders) {
    await cleanFolder(`${prefix}/${folder.name}`);
  }
}

// Lister tous les "dossiers" racine du bucket
const root = await listAll("");
const userFolders = root.filter((i) => !i.id && i.name.startsWith("user-"));
// Anciens dossiers sans préfixe user- (ex: UUID directement)
const legacyFolders = root.filter((i) => !i.id && !i.name.startsWith("user-") && i.name !== "avatars");

const allFolders = [...userFolders, ...legacyFolders];

for (const folder of allFolders) {
  const sectionImagesPath = `${folder.name}/section-images`;
  const check = await listAll(sectionImagesPath);
  if (check.length === 0) continue;
  await cleanFolder(sectionImagesPath);
}

// Anciens dossiers legacy racine (UUID sans user-)
for (const folder of legacyFolders) {
  const items = await listAll(folder.name);
  if (items.some((i) => i.name === "section-images")) {
    await cleanFolder(`${folder.name}/section-images`);
  }
  // Supprimer le dossier racine vide si besoin (Supabase le fait automatiquement)
}

console.log("✓ Nettoyage terminé.");
