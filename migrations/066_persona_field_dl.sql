-- Feature flag : champ de profil persona "Liste descriptive" (dl)
INSERT INTO public.feature_flags (key, enabled, label, description)
VALUES (
  'persona_field_dl',
  true,
  'Champ : Liste descriptive',
  'Bloc liste descriptive dans les profils de persona (paires titre/description alignées, largeur de la colonne titre déterminée par le plus long).'
)
ON CONFLICT (key) DO NOTHING;
