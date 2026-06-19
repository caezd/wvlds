export interface WorldCatalogCategory {
  id: string;
  world_id: string;
  type: "inventory" | "skills";
  name: string;
  sort_index: number;
  column_index: number;
}

export interface WorldInventoryItem {
  id: string;
  world_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_index: number;
  category_id?: string | null;
}

export interface WorldSkill {
  id: string;
  world_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_index: number;
  category_id?: string | null;
}
