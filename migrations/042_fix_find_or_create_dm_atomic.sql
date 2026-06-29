-- Rend find_or_create_dm atomique pour éviter les doublons en cas d'appels concurrents.
-- L'ancien pattern SELECT … IF NULL THEN INSERT pouvait créer deux lignes si deux appels
-- arrivaient simultanément avant qu'un COMMIT soit visible de l'autre transaction.
-- Le nouveau pattern INSERT … ON CONFLICT DO NOTHING puis SELECT garantit l'atomicité.

create or replace function find_or_create_dm(p_other_user_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_me uuid := (select auth.uid());
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_me = p_other_user_id then
    raise exception 'Cannot open a DM with yourself';
  end if;

  if v_me < p_other_user_id then
    v_a := v_me; v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := v_me;
  end if;

  -- Tentative d'insertion atomique ; si la paire existe déjà, ON CONFLICT DO NOTHING
  -- ne renvoie rien (RETURNING est vide) sans lever d'erreur.
  insert into dm_conversations (participant_a, participant_b)
  values (v_a, v_b)
  on conflict (participant_a, participant_b) do nothing
  returning id into v_id;

  -- Si l'insertion n'a rien renvoyé (conflit ou ligne déjà présente), on lit l'id.
  if v_id is null then
    select id into v_id
    from dm_conversations
    where participant_a = v_a and participant_b = v_b;
  end if;

  return v_id;
end;
$$;

-- Nettoyage des éventuels doublons créés avant ce correctif :
-- On garde la ligne la plus ancienne (première créée) et on recrée les messages
-- et dm_reads orphelins sur cette ligne avant de supprimer les doublons.
-- NOTE : les messages existants sur la ligne dupliquée sont déplacés vers la ligne canonique.
do $$
declare
  dup record;
  canonical_id uuid;
begin
  for dup in (
    select participant_a, participant_b, min(created_at) as first_at
    from dm_conversations
    group by participant_a, participant_b
    having count(*) > 1
  ) loop
    -- L'id canonique = la conversation la plus ancienne
    select id into canonical_id
    from dm_conversations
    where participant_a = dup.participant_a and participant_b = dup.participant_b
    order by created_at asc
    limit 1;

    -- Déplacer les messages des doublons vers la ligne canonique
    update dm_messages
    set conversation_id = canonical_id
    where conversation_id in (
      select id from dm_conversations
      where participant_a = dup.participant_a and participant_b = dup.participant_b
        and id <> canonical_id
    );

    -- Supprimer les dm_reads orphelins des doublons (on garde ceux de la canonique)
    delete from dm_reads
    where conversation_id in (
      select id from dm_conversations
      where participant_a = dup.participant_a and participant_b = dup.participant_b
        and id <> canonical_id
    );

    -- Supprimer les doublons
    delete from dm_conversations
    where participant_a = dup.participant_a and participant_b = dup.participant_b
      and id <> canonical_id;
  end loop;
end;
$$;
