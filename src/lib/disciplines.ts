import type { Discipline } from "@/db/schema";

export const DISCIPLINES: Discipline[] = ["MS", "WS", "MD", "WD", "XD"];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: "Mixed doubles",
};

export function isDoubles(d: Discipline): boolean {
  return d === "MD" || d === "WD" || d === "XD";
}

export function parseDiscipline(raw: string | null | undefined): Discipline | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^(ms|men'?s singles?)$/.test(s)) return "MS";
  if (/^(ws|ls|women'?s singles?|ladies'? singles?)$/.test(s)) return "WS";
  if (/^(md|men'?s doubles?)$/.test(s)) return "MD";
  if (/^(wd|ld|women'?s doubles?|ladies'? doubles?)$/.test(s)) return "WD";
  if (/^(xd|mx|mixed doubles?)$/.test(s)) return "XD";
  return null;
}
