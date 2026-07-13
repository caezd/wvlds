export interface WorldTimelineConfig {
  year_label: string;
  era_name: string | null;
  month_names: string[];
  current_year: number;
  current_month: number | null;
}

export interface WorldTimelineDate {
  year: number;
  month: number | null;
  day: number | null;
}

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

export interface WorldMap {
  id: string;
  world_id: string;
  image_url: string | null;
  label: string;
}

export interface WorldMapPin {
  id: string;
  world_id: string;
  x: number;
  y: number;
  title: string;
  description: string | null;
  banner_url: string | null;
  color: string;
  icon: string;
  icon_color: string;
  border_color: string | null;
  border_style: string;
  sort_index: number;
}

export interface ChatroomCategory {
  id: string;
  world_id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  position: number;
}

export interface WorldTag {
  id: string;
  world_id: string;
  tag: string;
  created_at: string;
}

export type World = {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  color?: string | null; // hex (#RRGGBB)
  visibility?: string | null;
  enable_inventory?: boolean | null;
  enable_skills?: boolean | null;
  enable_faceclaims?: boolean | null;
  restrict_inventory?: boolean | null;
  restrict_skills?: boolean | null;
  timeline_enabled?: boolean | null;
  timeline_config?: WorldTimelineConfig | null;
  allows_real_avatars?: boolean | null;
  allows_illustrated_avatars?: boolean | null;
  is_age_restricted?: boolean | null;
};
