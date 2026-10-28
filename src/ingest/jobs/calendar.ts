import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Db } from "@/db";
import { isTier } from "@/lib/tiers";
import { slugify } from "@/lib/text";
import { IdCache, upsertTournament } from "../upsert";
import type { UpsertStats } from "../types";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Entry = z.object({
  // BWF's tournament code (a GUID in tournament page URLs). Needed for draws and results.
  bwfCode: z.string().optional(),
  name: z.string().min(3),
  tier: z.string().refine(isTier, "unknown tier (see src/lib/tiers.ts)"),
  city: z.string().optional(),
  country: z.string().optional(),
  venue: z.string().optional(),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "not an IANA timezone"),
  startDate: ymd,
  endDate: ymd,
  status: z.enum(["cancelled", "postponed"]).optional(),
  websiteUrl: z.string().url().optional(),
  // Where the details above came from, for whoever checks them next.
  source: z.string().optional(),
});

export const CalendarFile = z.array(Entry);

/**
 * Reads the curated calendar in data/tournaments.json. The BWF calendar endpoint
 * isn't confirmed yet; once it is, it can feed the same upsert.
 */
export async function ingestCalendar(db: Db, file = path.join(process.cwd(), "data/tournaments.json")) {
  const entries = CalendarFile.parse(JSON.parse(await readFile(file, "utf8")));
  const stats: UpsertStats = { tournaments: entries.length, created: 0, updated: 0 };
  const cache = new IdCache();
  for (const e of entries) {
    if (e.endDate < e.startDate) throw new Error(`${e.name}: endDate before startDate`);
    const source = e.bwfCode ? "bwf" : "curated";
    const r = await upsertTournament(
      db,
      source,
      {
        externalId: e.bwfCode ?? slugify(e.name),
        name: e.name,
        tier: e.tier,
        city: e.city,
        country: e.country,
        venue: e.venue,
        timezone: e.timezone,
        startDate: e.startDate,
        endDate: e.endDate,
        statusOverride: e.status ?? null,
        websiteUrl: e.websiteUrl,
      },
      cache,
    );
    stats[r.created ? "created" : "updated"]++;
  }
  return stats;
}
