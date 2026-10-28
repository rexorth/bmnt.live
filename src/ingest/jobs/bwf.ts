import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { externalIds, tournaments } from "@/db/schema";
import { addDays, dateInZone } from "@/lib/time";
import { fetchDayMatches } from "../sources/bwf/client";
import { mapDayMatches } from "../sources/bwf/map";
import { IdCache, upsertMatches } from "../upsert";
import type { UpsertStats } from "../types";

type BwfTournament = { id: number; name: string; code: string; startDate: string; endDate: string; timezone: string };

async function bwfTournaments(db: Db, where?: ReturnType<typeof and>): Promise<BwfTournament[]> {
  return db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      code: externalIds.externalId,
      startDate: tournaments.startDate,
      endDate: tournaments.endDate,
      timezone: tournaments.timezone,
    })
    .from(tournaments)
    .innerJoin(
      externalIds,
      and(
        eq(externalIds.entityId, tournaments.id),
        eq(externalIds.entityType, "tournament"),
        eq(externalIds.source, "bwf"),
      ),
    )
    .where(where);
}

async function ingestDay(db: Db, t: BwfTournament, date: string, cache: IdCache, stats: UpsertStats) {
  const payload = await fetchDayMatches(t.code, date, db);
  const { matches, unmapped } = mapDayMatches(payload, t.code);
  stats.records = (stats.records ?? 0) + matches.length + unmapped.length;
  stats.unmapped = (stats.unmapped ?? 0) + unmapped.length;
  if (unmapped.length) {
    const reasons = [...new Set(unmapped.map((u) => u.reason))].join(", ");
    console.warn(`${t.name} ${date}: ${unmapped.length} records not mapped (${reasons})`);
    // Every record failing means the response shape changed or was never what we expect.
    if (!matches.length) throw new Error(`BWF day-matches for ${t.code} ${date}: no record could be mapped`);
  }
  const s = await upsertMatches(db, "bwf", matches, cache);
  for (const [k, v] of Object.entries(s)) stats[k] = (stats[k] ?? 0) + v;
}

// Every day of one tournament.
export async function ingestTournament(db: Db, slug: string): Promise<UpsertStats> {
  const [t] = await bwfTournaments(db, and(eq(tournaments.slug, slug)));
  if (!t) throw new Error(`no tournament "${slug}" with a BWF code; add its bwfCode in data/tournaments.json`);
  const stats: UpsertStats = {};
  const cache = new IdCache();
  for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) await ingestDay(db, t, d, cache, stats);
  return stats;
}

// Tournaments within a week either side of today: catches late result corrections.
export async function ingestRecent(db: Db, now = new Date()): Promise<UpsertStats> {
  const today = now.toISOString().slice(0, 10);
  const list = await bwfTournaments(
    db,
    and(lte(tournaments.startDate, addDays(today, 7)), gte(tournaments.endDate, addDays(today, -7))),
  );
  const stats: UpsertStats = { tournaments: list.length };
  const cache = new IdCache();
  for (const t of list) {
    const last = dateInZone(now, t.timezone) < t.endDate ? dateInZone(now, t.timezone) : t.endDate;
    for (let d = t.startDate; d <= last; d = addDays(d, 1)) await ingestDay(db, t, d, cache, stats);
  }
  return stats;
}

// Today's matches for tournaments in progress: scores, status and observed start/end times.
export async function ingestLive(db: Db, now = new Date()): Promise<UpsertStats> {
  const today = now.toISOString().slice(0, 10);
  const list = await bwfTournaments(
    db,
    and(lte(tournaments.startDate, addDays(today, 1)), gte(tournaments.endDate, addDays(today, -1))),
  );
  const stats: UpsertStats = { tournaments: 0 };
  const cache = new IdCache();
  for (const t of list) {
    const local = dateInZone(now, t.timezone);
    if (local < t.startDate || local > t.endDate) continue;
    stats.tournaments++;
    await ingestDay(db, t, local, cache, stats);
  }
  return stats;
}

// Saves a raw response so the mapper can be checked against what BWF really sends.
export async function captureDayMatches(code: string, date: string) {
  const payload = await fetchDayMatches(code, date);
  const dir = path.join(process.cwd(), "tests/fixtures/bwf");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `day-matches-${code}-${date}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2));
  const { matches, unmapped } = mapDayMatches(payload, code);
  return { file, mapped: matches.length, unmapped: unmapped.length };
}
