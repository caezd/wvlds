-- chatroom_categories: catégories pour organiser/grouper les chatrooms d'un monde
-- (documente un schéma déjà appliqué manuellement en prod — traçabilité git seulement)
CREATE TABLE IF NOT EXISTS chatroom_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  banner_url  TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chatroom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatroom_categories select if member" ON chatroom_categories
  FOR SELECT USING (is_world_member(world_id, auth.uid()));

CREATE POLICY "chatroom_categories insert if editor" ON chatroom_categories
  FOR INSERT WITH CHECK (is_world_editor(world_id, auth.uid()));

CREATE POLICY "chatroom_categories update if editor" ON chatroom_categories
  FOR UPDATE USING (is_world_editor(world_id, auth.uid()))
  WITH CHECK (is_world_editor(world_id, auth.uid()));

CREATE POLICY "chatroom_categories delete if editor" ON chatroom_categories
  FOR DELETE USING (is_world_editor(world_id, auth.uid()));

-- Rattachement d'une chatroom à une catégorie (optionnel)
ALTER TABLE chatrooms
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES chatroom_categories(id) ON DELETE SET NULL;

-- Bucket Storage pour les bannières de catégorie
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chatroom-categories',
  'chatroom-categories',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chatroom_categories bucket select public" ON storage.objects
  FOR SELECT USING (bucket_id = 'chatroom-categories');

-- Chemin attendu : world-<world_id>/category-*.webp — on extrait le world_id
-- du chemin et on verifie que l'utilisateur est editeur de ce monde precis,
-- plutot que d'autoriser n'importe quel utilisateur authentifie a
-- inserer/modifier/supprimer n'importe quel objet du bucket.
CREATE POLICY "chatroom_categories bucket insert if editor" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chatroom-categories'
    AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND is_world_editor((substring(name from '^world-([0-9a-fA-F-]{36})/'))::uuid, auth.uid())
  );

CREATE POLICY "chatroom_categories bucket update if editor" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chatroom-categories'
    AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND is_world_editor((substring(name from '^world-([0-9a-fA-F-]{36})/'))::uuid, auth.uid())
  );

CREATE POLICY "chatroom_categories bucket delete if editor" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chatroom-categories'
    AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND is_world_editor((substring(name from '^world-([0-9a-fA-F-]{36})/'))::uuid, auth.uid())
  );
