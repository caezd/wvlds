-- Bucket public pour les avatars de personas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'personas',
  'personas',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique
CREATE POLICY "personas avatars public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'personas');

-- Upload par les utilisateurs authentifiés
CREATE POLICY "personas avatars authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'personas');

-- Remplacement (upsert) par les utilisateurs authentifiés
CREATE POLICY "personas avatars authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'personas');
