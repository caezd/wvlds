import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const orphans = [
  "avatars/af7ceec6-c95e-4582-999d-8300764e8849.png",
  "avatars/b43231ca-6866-405c-bd61-4bc27ccfb1f9.png",
  "avatars/c54789fc-97ca-4a54-a6a2-51eba67119f0.png",
  "user-7d78c1dd-32c7-467c-a821-6ffb47e4b840/avatars/47f8ae6e-2248-4bd0-a9e7-0ee341cda9e8",
  "user-7d78c1dd-32c7-467c-a821-6ffb47e4b840/avatars/47f8ae6e-2248-4bd0-a9e7-0ee341cda9e8.jpg",
  "user-7d78c1dd-32c7-467c-a821-6ffb47e4b840/banners/af7ceec6-c95e-4582-999d-8300764e8849.jpg",
  "user-85c4e8f5-e0f7-43cc-ab4f-716779048e97/avatars/9c0e393c-5e38-4322-8714-8faac275d9b2",
  "user-85c4e8f5-e0f7-43cc-ab4f-716779048e97/banners/b43231ca-6866-405c-bd61-4bc27ccfb1f9",
];

const { error } = await supabase.storage.from("personas").remove(orphans);
if (error) { console.error("Erreur :", error.message); process.exit(1); }
console.log(`✓ ${orphans.length} fichiers orphelins supprimés.`);
