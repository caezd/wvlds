export type AvatarTypeFilter = "real" | "illustrated";

export function buildExploreParams(params: {
  q?: string;
  tags?: string[];
  avatarTypes?: string[];
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.tags && params.tags.length > 0) sp.set("tags", params.tags.join(","));
  if (params.avatarTypes && params.avatarTypes.length > 0) sp.set("avatar", params.avatarTypes.join(","));
  if (params.page) sp.set("page", String(params.page));
  return sp.toString();
}
