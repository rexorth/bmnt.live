// Ordered from most to least prestigious; the order drives filter menus and badges.
export const TIERS = [
  { key: "olympics", label: "Olympic Games" },
  { key: "world_championships", label: "World Championships" },
  { key: "world_tour_finals", label: "World Tour Finals" },
  { key: "super_1000", label: "Super 1000" },
  { key: "super_750", label: "Super 750" },
  { key: "super_500", label: "Super 500" },
  { key: "super_300", label: "Super 300" },
  { key: "super_100", label: "Super 100" },
  { key: "continental", label: "Continental Championships" },
  { key: "international_challenge", label: "International Challenge" },
  { key: "international_series", label: "International Series" },
  { key: "future_series", label: "Future Series" },
  { key: "team", label: "Team event" },
  { key: "other", label: "Other" },
] as const;

export type Tier = (typeof TIERS)[number]["key"];

export function tierLabel(key: string): string {
  return TIERS.find((t) => t.key === key)?.label ?? "Other";
}

export function isTier(key: string): key is Tier {
  return TIERS.some((t) => t.key === key);
}
