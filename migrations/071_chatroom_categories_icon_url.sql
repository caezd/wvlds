-- Image de catégorie (recadrée en carré côté client) — affichée en fallback
-- (à la place de la lettre) partout où l'avatar de catégorie apparaît en petit
-- format, prioritaire sur la bannière (large, 3/1) dans ces emplacements.
ALTER TABLE chatroom_categories ADD COLUMN IF NOT EXISTS icon_url TEXT;
