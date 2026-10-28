import { and, eq, like, or } from "drizzle-orm";
import type { Db } from "@/db";
import { events, externalIds, matches, matchSides, players, tournaments } from "@/db/schema";
import { roundIndex } from "@/lib/rounds";
import { normalizeText, slugify } from "@/lib/text";
import type { NMatch, NPlayer, NTournament, UpsertStats } from "./types";

type Entity = "tournament" | "player" | "match";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

// Per-run memo of (source, entity, externalId) -> row id, to avoid repeat lookups.
export class IdCache {
  private map = new Map<string, number>();
  key(source: string, entity: Entity, ext: string) {
    return `${source}|${entity}|${ext}`;
  }
  get(source: string, entity: Entity, ext: string) {
    return this.map.get(this.key(source, entity, ext));
  }
  set(source: string, entity: Entity, ext: string, id: number) {
    this.map.set(this.key(source, entity, ext), id);
  }
}

async function findId(db: Conn, source: string, entity: Entity, externalId: string, cache?: IdCache) {
  const hit = cache?.get(source, entity, externalId);
  if (hit) return hit;
  const [row] = await db
    .select({ id: externalIds.entityId })
    .from(externalIds)
    .where(
      and(eq(externalIds.source, source), eq(externalIds.entityType, entity), eq(externalIds.externalId, externalId)),
    );
  if (row) cache?.set(source, entity, externalId, row.id);
  return row?.id;
}

async function linkId(db: Conn, source: string, entity: Entity, externalId: string, id: number, cache?: IdCache) {
  await db.insert(externalIds).values({ source, entityType: entity, externalId, entityId: id }).onConflictDoNothing();
  cache?.set(source, entity, externalId, id);
}

async function uniqueSlug(db: Conn, table: typeof tournaments | typeof players, base: string) {
  const rows = await db
    .select({ slug: table.slug })
    .from(table)
    .where(or(eq(table.slug, base), like(table.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export async function upsertTournament(db: Conn, source: string, t: NTournament, cache?: IdCache) {
  const values = {
    name: t.name,
    nameSearch: normalizeText(t.name),
    tier: t.tier,
    city: t.city ?? null,
    country: t.country ?? null,
    venue: t.venue ?? null,
    timezone: t.timezone,
    startDate: t.startDate,
    endDate: t.endDate,
    statusOverride: t.statusOverride ?? null,
    prizeMoney: t.prizeMoney ?? null,
    logoUrl: t.logoUrl ?? null,
    websiteUrl: t.websiteUrl ?? null,
    updatedAt: new Date(),
  };
  const existing = await findId(db, source, "tournament", t.externalId, cache);
  if (existing) {
    await db.update(tournaments).set(values).where(eq(tournaments.id, existing));
    return { id: existing, created: false };
  }
  const slug = await uniqueSlug(db, tournaments, slugify(t.name));
  const [row] = await db
    .insert(tournaments)
    .values({ ...values, slug })
    .returning({ id: tournaments.id });
  await linkId(db, source, "tournament", t.externalId, row.id, cache);
  return { id: row.id, created: true };
}

export async function upsertPlayer(db: Conn, source: string, p: NPlayer, cache?: IdCache) {
  const existing = await findId(db, source, "player", p.externalId, cache);
  // Sources often omit fields on some endpoints; never blank out what we already have.
  const values = {
    name: p.name,
    nameSearch: normalizeText(p.name),
    ...(p.lastName ? { lastName: p.lastName } : {}),
    ...(p.country ? { country: p.country } : {}),
    ...(p.gender ? { gender: p.gender } : {}),
    ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(players).set(values).where(eq(players.id, existing));
    return existing;
  }
  const slug = await uniqueSlug(db, players, slugify(p.name));
  const [row] = await db
    .insert(players)
    .values({ ...values, slug })
    .returning({ id: players.id });
  await linkId(db, source, "player", p.externalId, row.id, cache);
  return row.id;
}

export async function upsertMatch(db: Db, source: string, m: NMatch, cache?: IdCache, now = new Date()) {
  const tournamentId = await findId(db, source, "tournament", m.tournamentExternalId, cache);
  if (!tournamentId) throw new Error(`unknown tournament ${source}:${m.tournamentExternalId}`);

  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({ tournamentId, discipline: m.discipline, drawType: m.drawType, drawSize: m.drawSize ?? null })
      .onConflictDoUpdate({
        target: [events.tournamentId, events.discipline, events.drawType],
        set: m.drawSize ? { drawSize: m.drawSize } : { discipline: m.discipline },
      })
      .returning({ id: events.id });

    const sideRows: { side: number; slot: number; playerId: number; seed: string | null }[] = [];
    for (const s of m.sides) {
      for (const [slot, p] of s.players.entries()) {
        const playerId = await upsertPlayer(tx, source, p, cache);
        sideRows.push({ side: s.side, slot, playerId, seed: s.seed ?? null });
      }
    }

    const values = {
      tournamentId,
      eventId: event.id,
      round: m.round,
      roundIndex: roundIndex(m.round),
      bracketPosition: m.bracketPosition ?? null,
      court: m.court ?? null,
      scheduledAt: m.scheduledAt ?? null,
      status: m.status,
      winnerSide: m.winnerSide ?? null,
      games: m.games,
      durationMin: m.durationMin ?? null,
      updatedAt: now,
    };

    const finished = m.status === "completed" || m.status === "retired" || m.status === "walkover";
    let matchId = await findId(tx, source, "match", m.externalId, cache);
    let created = false;
    if (matchId) {
      const [prev] = await tx
        .select({ status: matches.status, startedAt: matches.startedAt, endedAt: matches.endedAt })
        .from(matches)
        .where(eq(matches.id, matchId));
      // Record when we first saw the match go live and when it finished. Only a
      // transition we observed counts, so a backfilled result never gets a fake time.
      const observed = {
        ...(m.status === "live" && !prev.startedAt ? { startedAt: now } : {}),
        ...(finished && prev.status === "live" && !prev.endedAt ? { endedAt: now } : {}),
      };
      await tx
        .update(matches)
        .set({ ...values, ...observed })
        .where(eq(matches.id, matchId));
    } else {
      const [row] = await tx
        .insert(matches)
        .values({ ...values, ...(m.status === "live" ? { startedAt: now } : {}) })
        .returning({ id: matches.id });
      matchId = row.id;
      created = true;
      await linkId(tx, source, "match", m.externalId, matchId, cache);
    }

    await tx.delete(matchSides).where(eq(matchSides.matchId, matchId));
    if (sideRows.length) await tx.insert(matchSides).values(sideRows.map((r) => ({ ...r, matchId })));
    return { id: matchId, created };
  });
}

export async function upsertMatches(db: Db, source: string, list: NMatch[], cache = new IdCache()) {
  const stats: UpsertStats = { matches: list.length, created: 0, updated: 0 };
  for (const m of list) {
    const r = await upsertMatch(db, source, m, cache);
    stats[r.created ? "created" : "updated"]++;
  }
  return stats;
}
