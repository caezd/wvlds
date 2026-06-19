-- Ajoute une colonne icon (nom d'icône Lucide) aux pages du wiki
ALTER TABLE world_wiki_pages ADD COLUMN IF NOT EXISTS icon TEXT;
