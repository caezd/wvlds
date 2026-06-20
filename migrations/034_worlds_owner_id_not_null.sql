-- Garde-fou : un monde ne peut plus exister sans propriétaire.
--
-- Contexte : des mondes hérités (créés avant le câblage de l'ownership, nov. 2025)
-- subsistaient avec owner_id = NULL et aucune ligne world_members. Aucune policy
-- SELECT de `worlds` ne pouvant matcher (ni owner, ni membre, ni invité, ni
-- persona owner), ces mondes renvoyaient un 404 pour TOUS les utilisateurs.
--
-- Les lignes orphelines (Avalonia, Aion) ont été supprimées (elles étaient vides :
-- 0 persona, 0 message). Cette contrainte empêche le problème de réapparaître.
ALTER TABLE public.worlds ALTER COLUMN owner_id SET NOT NULL;
