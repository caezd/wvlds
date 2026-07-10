"use client";

import { WorldTabs } from "./WorldTabs";
import { WorldTabContent } from "./WorldTabContent";

/**
 * Onglets descriptifs du monde (kit "Constructor X") : pills + contenu
 * markdown de chaque onglet, éditable par les admins.
 */
export function WorldAboutTabs({
  worldId,
  canEdit = false,
}: {
  worldId: string;
  canEdit?: boolean;
}) {
  return (
    <WorldTabs
      worldId={worldId}
      canEdit={canEdit}
      renderTab={(tab) => (
        <WorldTabContent
          key={tab.id}
          tabId={tab.id}
          initialContent={tab.content ?? null}
          canEdit={canEdit}
        />
      )}
    />
  );
}
