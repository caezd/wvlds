-- Feature flag : catalogue d'objets / compétences par monde
INSERT INTO public.feature_flags (key, enabled, label, description)
VALUES (
  'world_catalogue',
  true,
  'Catalogue de monde',
  'Affiche le catalogue d''objets et de compétences dans les mondes (inventaire et compétences restreints ou éditeurs).'
)
ON CONFLICT (key) DO NOTHING;
