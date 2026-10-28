/**
 * Runs the ingest pipeline against a real Postgres. Set DATABASE_URL_TEST to a
 * database that can be wiped, e.g. postgres://postgres:postgres@localhost:5432/bmnt_test
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { count, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { matches, matchSides, players, tournaments, videoLinks } from "@/db/schema";
import { ingestCalendar } from "@/ingest/jobs/calendar";
import { linkVideo, upsertVideo } from "@/ingest/jobs/youtube";
import { parseVideosResponse } from "@/ingest/sources/youtube/client";
import type { NMatch } from "@/ingest/types";
import { IdCache, upsertMatch, upsertTournament } from "@/ingest/upsert";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("ingest pipeline", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(url);
    await db.execute(
      sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
    );
    await migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });
  });
  afterAll(async () => {
    await db?.$client.end();
  });

  it("loads the curated calendar idempotently", async () => {
    const first = await ingestCalendar(db);
    const second = await ingestCalendar(db);
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    const [{ n }] = await db.select({ n: count() }).from(tournaments);
    expect(n).toBe(first.tournaments);
  });

  it("upserts matches without duplicates and records observed times", async () => {
    const cache = new IdCache();
    await upsertTournament(
      db,
      "test",
      {
        externalId: "T1",
        name: "Test Open 2026",
        tier: "super_300",
        timezone: "UTC",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
      },
      cache,
    );
    const base: NMatch = {
      externalId: "M1",
      tournamentExternalId: "T1",
      discipline: "MD",
      drawType: "main",
      round: "QF",
      court: "Court 1",
      scheduledAt: new Date("2026-10-03T10:00:00Z"),
      status: "scheduled",
      games: [],
      sides: [
        {
          side: 1,
          players: [
            { externalId: "p1", name: "Alpha One" },
            { externalId: "p2", name: "Beta Two" },
          ],
        },
        {
          side: 2,
          players: [
            { externalId: "p3", name: "Gamma Three" },
            { externalId: "p4", name: "Delta Four" },
          ],
        },
      ],
    };
    const r1 = await upsertMatch(db, "test", base, cache);
    await upsertMatch(
      db,
      "test",
      { ...base, status: "live", games: [{ a: 5, b: 3 }] },
      cache,
      new Date("2026-10-03T10:07:00Z"),
    );
    const r3 = await upsertMatch(
      db,
      "test",
      {
        ...base,
        status: "completed",
        winnerSide: 2,
        games: [
          { a: 15, b: 21 },
          { a: 18, b: 21 },
        ],
      },
      cache,
      new Date("2026-10-03T10:52:00Z"),
    );
    expect(r1.created).toBe(true);
    expect(r3).toEqual({ id: r1.id, created: false });

    const [m] = await db.select().from(matches).where(eq(matches.id, r1.id));
    expect(m.startedAt).toEqual(new Date("2026-10-03T10:07:00Z"));
    expect(m.endedAt).toEqual(new Date("2026-10-03T10:52:00Z"));
    expect(m.winnerSide).toBe(2);
    const [{ sides }] = await db.select({ sides: count() }).from(matchSides).where(eq(matchSides.matchId, r1.id));
    expect(sides).toBe(4);
    const [{ ps }] = await db.select({ ps: count() }).from(players);
    expect(ps).toBe(4);
  });

  it("links real BWF TV court streams to the right tournament day", async () => {
    const items = parseVideosResponse(
      JSON.parse(readFileSync(path.join(__dirname, "../fixtures/youtube/bwftv-videos.json"), "utf8")),
    );
    const stats = { matchLinks: 0, courtLinks: 0, tournamentLinks: 0, pending: 0 };
    for (const item of items) {
      const id = await upsertVideo(db, item, null);
      await linkVideo(db, id, stats);
    }
    const [hylo] = await db.select().from(tournaments).where(eq(tournaments.slug, "hylo-open-2026"));
    const links = await db
      .select({ day: videoLinks.day, court: videoLinks.court })
      .from(videoLinks)
      .where(eq(videoLinks.tournamentId, hylo.id));
    const courtDays = links
      .filter((l) => l.court)
      .map((l) => `${l.day} ${l.court}`)
      .sort();
    // Day 1 streams (27 Oct) and the upcoming Day 2 streams (28 Oct) for courts 1-3.
    expect(courtDays).toEqual([
      "2026-10-27 1",
      "2026-10-27 2",
      "2026-10-27 3",
      "2026-10-28 1",
      "2026-10-28 2",
      "2026-10-28 3",
    ]);

    // Linking twice must not add rows.
    const before = (await db.select({ n: count() }).from(videoLinks))[0].n;
    for (const item of items.slice(0, 20)) {
      const id = await upsertVideo(db, item, null);
      await linkVideo(db, id, stats);
    }
    const after = (await db.select({ n: count() }).from(videoLinks))[0].n;
    expect(after).toBe(before);
  });
});
