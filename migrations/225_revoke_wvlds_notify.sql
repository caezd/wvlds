-- 225 — `wvlds_notify` n'est plus appelable par les clients.
--
-- Migration 214 : `wvlds_notify(topic, event, payload)` envoie un avis sur un
-- canal PRIVÉ (`realtime.send`). Elle est SECURITY DEFINER — c'est ce qui lui
-- permet d'écrire sur n'importe quel canal —, et le droit EXECUTE accordé par
-- défaut à PUBLIC n'avait pas été retiré. N'importe qui, sans compte, pouvait
-- donc l'appeler par `/rest/v1/rpc/wvlds_notify` et diffuser ce qu'il voulait
-- sur n'importe quel canal : faux message privé sur `msgs:<joueur>` (affiché
-- tel quel dans la conversation ouverte), faux message du chat en direct,
-- liste des salons faussée… Rien n'était écrit en base, mais rien ne
-- distinguait ces avis des vrais.
--
-- Ses seuls appelants sont les triggers `broadcast_*` (SECURITY DEFINER,
-- propriétaire `postgres`) : ils l'exécutent avec les droits du propriétaire
-- et ne sont pas concernés. Le client ne l'appelle jamais.

REVOKE EXECUTE ON FUNCTION public.wvlds_notify(text, text, jsonb) FROM PUBLIC, anon, authenticated;
