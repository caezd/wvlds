-- ============================================================
-- Migration 003 — Bucket Storage pour les assets cosmétiques
-- ============================================================

-- Création du bucket public "cosmetics"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cosmetics',
  'cosmetics',
  true,                          -- accès public en lecture (URLs directes)
  2097152,                       -- 2 Mo max par fichier
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;


-- Lecture publique (tout le monde peut lire)
CREATE POLICY "cosmetics: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cosmetics');

-- Upload réservé aux admins
CREATE POLICY "cosmetics: admin upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cosmetics'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Suppression réservée aux admins
CREATE POLICY "cosmetics: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cosmetics'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
