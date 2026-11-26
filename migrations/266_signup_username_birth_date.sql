-- ============================================================
-- Migration 266 — Pseudo et date de naissance à l'inscription
-- ============================================================
-- Le pseudo se choisit sur la page d'inscription, vérifié en direct
-- (`is_username_available`, ouverte aux visiteurs non connectés). Pseudo et
-- date de naissance voyagent dans `raw_user_meta_data` jusqu'à
-- `handle_new_user`, qui les range : un pseudo pris entre-temps ou mal formé
-- reste NULL (la fenêtre « Choisissez votre pseudo » prend alors le relais),
-- une date invalide n'est pas gardée.
--
-- La date de naissance ne va pas dans `profiles`, lisible par tout membre
-- connecté : elle a sa propre table, que seul son titulaire lit. Personne ne
-- l'écrit directement ; elle s'enregistre une fois, à l'inscription ou à la
-- première confirmation d'âge, et ne change plus.
--
-- Mondes 18+ : une date enregistrée remplace la confirmation. Majeur, on entre
-- sans rien saisir (adhésion, invitation, monde qui passe 18+) ; mineur, c'est
-- refusé, même avec `p_age_confirmed`. Sans date enregistrée, la date saisie
-- dans la confirmation (`p_birth_date`) est vérifiée puis gardée.

CREATE TABLE public.profile_birth_dates (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  birth_date date NOT NULL CHECK (birth_date >= DATE '1900-01-01'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_birth_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_birth_dates_select_own ON public.profile_birth_dates
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.profile_birth_dates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_birth_dates TO authenticated;

-- ── Âge ──────────────────────────────────────────────────────

/** Vrai si la date correspond à 18 ans révolus aujourd'hui. */
CREATE OR REPLACE FUNCTION public.is_adult_birth_date(p_birth_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_birth_date IS NOT NULL
     AND p_birth_date <= (current_date - interval '18 years')::date;
$$;

/** Une date plausible : réelle, passée, pas avant 1900. */
CREATE OR REPLACE FUNCTION public.is_valid_birth_date(p_birth_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_birth_date IS NOT NULL
     AND p_birth_date >= DATE '1900-01-01'
     AND p_birth_date <= current_date;
$$;

/**
 * L'âge de l'appelant d'après sa date enregistrée : true majeur, false
 * mineur, NULL sans date. Enregistre `p_birth_date` s'il n'y en a pas encore
 * et qu'elle est plausible.
 */
CREATE OR REPLACE FUNCTION public.resolve_my_adulthood(p_birth_date date DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stored date;
BEGIN
  SELECT birth_date INTO v_stored FROM public.profile_birth_dates WHERE user_id = auth.uid();
  IF v_stored IS NULL AND public.is_valid_birth_date(p_birth_date) THEN
    INSERT INTO public.profile_birth_dates (user_id, birth_date)
    VALUES (auth.uid(), p_birth_date)
    ON CONFLICT (user_id) DO NOTHING;
    v_stored := p_birth_date;
  END IF;
  IF v_stored IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.is_adult_birth_date(v_stored);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_my_adulthood(date) FROM PUBLIC, anon, authenticated;

/** Enregistre la date de naissance de l'appelant, s'il n'en a pas encore. */
CREATE OR REPLACE FUNCTION public.set_my_birth_date(p_birth_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.';
  END IF;
  IF NOT public.is_valid_birth_date(p_birth_date) THEN
    RAISE EXCEPTION 'Date de naissance invalide.';
  END IF;
  INSERT INTO public.profile_birth_dates (user_id, birth_date)
  VALUES (auth.uid(), p_birth_date)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_birth_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birth_date(date) TO authenticated;

-- ── Pseudo ───────────────────────────────────────────────────

/** Vrai si le pseudo est bien formé et libre (sans égard à la casse). */
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_username ~ '^[A-Za-z0-9_]{3,32}$'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE lower(username) = lower(p_username)
         AND id IS DISTINCT FROM auth.uid()
     );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

-- ── Création du compte ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usern  text := nullif(new.raw_user_meta_data->>'username', '');
  v_avatar text := new.raw_user_meta_data->>'avatar_url';
  v_birth  date;
BEGIN
  -- Mal formé ou déjà pris : pas de pseudo, plutôt qu'une inscription refusée.
  IF v_usern IS NOT NULL AND (
       v_usern !~ '^[A-Za-z0-9_]{3,32}$'
       OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_usern))
     ) THEN
    v_usern := NULL;
  END IF;

  BEGIN
    v_birth := (new.raw_user_meta_data->>'birth_date')::date;
  EXCEPTION WHEN others THEN
    v_birth := NULL;
  END;

  BEGIN
    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (new.id, v_usern, v_avatar)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Le pseudo vient d'être pris par une inscription simultanée.
    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (new.id, NULL, v_avatar)
    ON CONFLICT (id) DO NOTHING;
  END;

  IF public.is_valid_birth_date(v_birth) THEN
    INSERT INTO public.profile_birth_dates (user_id, birth_date)
    VALUES (new.id, v_birth)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- ── Mondes 18+ ───────────────────────────────────────────────

/**
 * Décide l'entrée dans un monde 18+ : refuse un mineur connu ; admet un
 * majeur connu ; sinon s'en tient à la confirmation, avec la date saisie
 * (gardée) ou, à défaut, la case cochée.
 */
CREATE OR REPLACE FUNCTION public.assert_world_age_ok(p_age_confirmed boolean, p_birth_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_adult boolean := public.resolve_my_adulthood(p_birth_date);
BEGIN
  IF v_adult IS FALSE THEN
    RAISE EXCEPTION 'Ce monde est réservé aux personnes de 18 ans et plus.';
  END IF;
  IF v_adult IS NULL AND NOT coalesce(p_age_confirmed, false) THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_world_age_ok(boolean, date) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.join_public_world(uuid, boolean);
CREATE FUNCTION public.join_public_world(
  p_world_id uuid,
  p_age_confirmed boolean DEFAULT false,
  p_birth_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_age_restricted boolean;
BEGIN
  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id
    AND visibility = 'public'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce monde n''est pas accessible au public.';
  END IF;

  IF v_age_restricted THEN
    PERFORM public.assert_world_age_ok(p_age_confirmed, p_birth_date);
  END IF;

  INSERT INTO public.world_members (world_id, user_id, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO NOTHING;

  PERFORM public.grant_default_world_roles(p_world_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_world(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_world(uuid, boolean, date) TO authenticated;

DROP FUNCTION public.accept_world_invitation(uuid, boolean);
CREATE FUNCTION public.accept_world_invitation(
  p_world_id uuid,
  p_age_confirmed boolean DEFAULT false,
  p_birth_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id        uuid;
  v_has_invitation boolean;
  v_age_restricted boolean;
BEGIN
  SELECT role_id, true INTO v_role_id, v_has_invitation
  FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();

  IF NOT coalesce(v_has_invitation, false) THEN
    RAISE EXCEPTION 'Aucune invitation en attente pour ce monde.';
  END IF;

  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_age_restricted THEN
    PERFORM public.assert_world_age_ok(p_age_confirmed, p_birth_date);
  END IF;

  INSERT INTO public.world_members (world_id, user_id, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO NOTHING;

  IF v_role_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.world_roles r WHERE r.id = v_role_id AND r.world_id = p_world_id) THEN
    INSERT INTO public.world_member_roles (world_id, user_id, role_id)
    VALUES (p_world_id, auth.uid(), v_role_id)
    ON CONFLICT DO NOTHING;
  ELSE
    PERFORM public.grant_default_world_roles(p_world_id, auth.uid());
  END IF;

  DELETE FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.accept_world_invitation(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_world_invitation(uuid, boolean, date) TO authenticated;

-- La garde d'un membre (monde devenu 18+) : sans date enregistrée, la date
-- saisie est exigée ; avec, elle suffit. `setWorldAgeRestricted` l'appelle
-- sans date pour la personne qui active le réglage : elle reste admise.
DROP FUNCTION public.confirm_world_age(uuid);
CREATE FUNCTION public.confirm_world_age(p_world_id uuid, p_birth_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_adult boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.world_members
    WHERE world_id = p_world_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas membre de ce monde.';
  END IF;

  v_adult := public.resolve_my_adulthood(p_birth_date);
  IF v_adult IS FALSE THEN
    RAISE EXCEPTION 'Ce monde est réservé aux personnes de 18 ans et plus.';
  END IF;

  UPDATE public.world_members
  SET age_confirmed_at = now()
  WHERE world_id = p_world_id
    AND user_id = auth.uid()
    AND age_confirmed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_world_age(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_world_age(uuid, date) TO authenticated;

-- Un monde qui passe 18+ : ses membres majeurs connus n'ont rien à confirmer.
CREATE OR REPLACE FUNCTION public.tg_worlds_age_restricted_confirm_adults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.world_members m
  SET age_confirmed_at = now()
  FROM public.profile_birth_dates b
  WHERE m.world_id = new.id
    AND m.age_confirmed_at IS NULL
    AND b.user_id = m.user_id
    AND public.is_adult_birth_date(b.birth_date);
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_worlds_age_restricted_confirm_adults() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER worlds_age_restricted_confirm_adults
  AFTER UPDATE OF is_age_restricted ON public.worlds
  FOR EACH ROW
  WHEN (new.is_age_restricted AND NOT old.is_age_restricted)
  EXECUTE FUNCTION public.tg_worlds_age_restricted_confirm_adults();
