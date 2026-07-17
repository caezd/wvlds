// scripts/patreon-test-webhook.mjs
//
// Simule un webhook Patreon SIGNÉ (members:pledge:create/update/delete) contre
// une route /api/patreon/webhook locale ou distante, sans avoir besoin d'un
// vrai abonnement Patreon. Calcule la signature HMAC-MD5 avec le VRAI
// PATREON_WEBHOOK_SECRET, exactement comme le ferait Patreon.
//
// Usage :
//   node scripts/patreon-test-webhook.mjs --user <patreon_user_id> [options]
//
// Options :
//   --user <id>       (requis) patreon_user_id déjà lié dans patreon_accounts
//                      (celui qu'on a lié via /auth/patreon/connect)
//   --status <s>       active_patron | declined_patron | former_patron
//                      (défaut : active_patron)
//   --cents <n>        currently_entitled_amount_cents (défaut : PATREON_MIN_CENTS ou 500)
//   --url <url>        URL de la route webhook (défaut : http://localhost:3000/api/patreon/webhook)
//
// Exemples :
//   # Devenir mécène actif au-dessus du palier → plan passe à "subscribed"
//   node scripts/patreon-test-webhook.mjs --user 982522 --status active_patron --cents 500
//
//   # Simuler une résiliation → plan repasse à "free" (sauf lifetime)
//   node scripts/patreon-test-webhook.mjs --user 982522 --status former_patron --cents 0
//
// Charge .env automatiquement (Node 20.6+). Sinon, lancer avec :
//   node --env-file=.env scripts/patreon-test-webhook.mjs --user <id>

try {
  process.loadEnvFile();
} catch {
  // .env absent ou déjà chargé (ex. variables exportées manuellement) : on continue.
}

import { createHmac } from "node:crypto";

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const userId = argVal("--user", null);
const status = argVal("--status", "active_patron");
const cents = Number.parseInt(argVal("--cents", process.env.PATREON_MIN_CENTS ?? "500"), 10);
const url = argVal("--url", "http://localhost:3000/api/patreon/webhook");

const VALID_STATUSES = ["active_patron", "declined_patron", "former_patron"];

if (!userId) {
  console.error("Erreur : --user <patreon_user_id> est requis (l'id déjà lié dans patreon_accounts).");
  console.error("Usage : node scripts/patreon-test-webhook.mjs --user <id> [--status active_patron|declined_patron|former_patron] [--cents 500] [--url ...]");
  process.exit(1);
}
if (!VALID_STATUSES.includes(status)) {
  console.error(`Erreur : --status doit être l'un de ${VALID_STATUSES.join(", ")}`);
  process.exit(1);
}
if (!process.env.PATREON_WEBHOOK_SECRET) {
  console.error("Erreur : PATREON_WEBHOOK_SECRET absent de l'environnement (vérifie ton .env).");
  process.exit(1);
}

// Doit correspondre EXACTEMENT à la forme attendue par parseWebhookMember()
// (lib/patreon/client.ts) : data.relationships.user.data.id + data.attributes.*.
const payload = {
  data: {
    attributes: {
      patron_status: status,
      currently_entitled_amount_cents: cents,
    },
    relationships: {
      user: { data: { id: userId } },
    },
  },
};

const rawBody = JSON.stringify(payload);
// HMAC-MD5 du corps brut — même algorithme que lib/patreon/signature.ts.
const signature = createHmac("md5", process.env.PATREON_WEBHOOK_SECRET)
  .update(rawBody, "utf8")
  .digest("hex");

console.log(`→ POST ${url}`);
console.log(`  patreon_user_id=${userId} status=${status} cents=${cents}`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Patreon-Signature": signature,
  },
  body: rawBody,
});

const text = await res.text();
console.log(`← ${res.status} ${res.statusText}`);
if (text) console.log(text);

if (!res.ok) process.exit(1);
