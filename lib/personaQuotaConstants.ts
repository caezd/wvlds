// lib/personaQuotaConstants.ts
// Constante isolée, SANS AUCUNE dépendance — importable en toute sécurité
// depuis un composant client ou serveur. À NE PAS mettre dans lib/userQuota.ts :
// ce module importe (dynamiquement) lib/supabase/server, qui dépend de
// next/headers ; un composant client qui importerait la constante depuis
// userQuota.ts ferait échouer le build (« You're importing a module that
// depends on next/headers... »), même si l'import réel n'est que dynamique.

/**
 * Limite de personas PAR MONDE pour le plan gratuit — miroir de la règle DB
 * has_persona_capacity (migrations 052/054/056). À garder synchronisée avec
 * la fonction SQL si elle change.
 */
export const FREE_PERSONAS_PER_WORLD = 5;
