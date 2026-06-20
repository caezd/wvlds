-- Migration 022 — Activer Realtime sur la table notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
