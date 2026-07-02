-- Ajoute une bio et des pronoms personnalisables au profil joueur (carte profil type Discord).
alter table public.profiles
  add column if not exists bio text,
  add column if not exists pronouns text[] not null default '{}';

alter table public.profiles
  add constraint profiles_bio_length check (char_length(bio) <= 500);

comment on column public.profiles.bio is 'Bio libre du joueur, affichée sur sa carte profil.';
comment on column public.profiles.pronouns is 'Pronoms choisis (clés prédéfinies et/ou valeurs libres), affichés sur la carte profil.';
