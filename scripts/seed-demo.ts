/**
 * Loads SAMPLE data for local development and tests: three fictional tournaments
 * with fictional players, built around today's date so live, upcoming and completed
 * states all show. Everything is stored under the "demo" source and named
 * "(sample data)". Never run this against production.
 *
 *   pnpm db:seed           add or refresh sample data
 *   pnpm db:seed --clear   remove it
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { externalIds, tournaments, videoLinks, videos, type Discipline, type GameScore } from "@/db/schema";
import { IdCache, upsertMatch, upsertTournament } from "@/ingest/upsert";
import type { NMatch, NPlayer, NTournament } from "@/ingest/types";
import { addDays, dateInZone } from "@/lib/time";

const SOURCE = "demo";

// Deterministic PRNG so every seed run produces the same draws and scores.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST_M = [
  "Arlo",
  "Bram",
  "Caspian",
  "Dorian",
  "Emeric",
  "Fenwick",
  "Gideon",
  "Hollis",
  "Ivo",
  "Jory",
  "Kestrel",
  "Lorcan",
  "Marek",
  "Nilo",
  "Orrin",
  "Pell",
  "Quill",
  "Rune",
  "Sorrel",
  "Tamsin",
];
const FIRST_F = [
  "Ayla",
  "Brielle",
  "Calla",
  "Delphine",
  "Elara",
  "Fenna",
  "Greer",
  "Halcy",
  "Isolde",
  "Junia",
  "Kaia",
  "Liora",
  "Maren",
  "Nerys",
  "Odessa",
  "Perrin",
  "Quinna",
  "Rhoswen",
  "Saoirse",
  "Tove",
];
const LAST = [
  "Ashgrove",
  "Brightwater",
  "Coldharbour",
  "Dunmere",
  "Elderfield",
  "Foxhollow",
  "Greywick",
  "Hartwell",
  "Ironside",
  "Juniper",
  "Kingsbury",
  "Larkspur",
  "Marlowe",
  "Northcott",
  "Oakhurst",
  "Pennyworth",
  "Quarrington",
  "Ravensworth",
  "Silverlake",
  "Thornbury",
  "Underhill",
  "Valemont",
  "Westerly",
  "Yarrow",
];
const COUNTRIES = ["DEN", "JPN", "INA", "MAS", "CHN", "KOR", "IND", "FRA", "TPE", "THA", "ENG", "CAN"];

function makePlayers(rand: () => number, gender: "M" | "F", n: number, prefix: string): NPlayer[] {
  const firsts = gender === "M" ? FIRST_M : FIRST_F;
  return Array.from({ length: n }, (_, i) => {
    const last = LAST[(i * 7 + Math.floor(rand() * 3)) % LAST.length];
    const first = firsts[(i * 3 + Math.floor(rand() * 5)) % firsts.length];
    return {
      externalId: `${prefix}-${gender}-${i}`,
      name: `${first} ${last}`,
      lastName: last,
      country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
      gender,
    };
  });
}

function playGames(rand: () => number, winner: 1 | 2): GameScore[] {
  const three = rand() < 0.35;
  const game = (w: 1 | 2): GameScore => {
    const deuce = rand() < 0.15;
    const hi = deuce ? 22 + Math.floor(rand() * 4) : 21;
    const lo = deuce ? hi - 2 : 8 + Math.floor(rand() * 12);
    return w === 1 ? { a: hi, b: lo } : { a: lo, b: hi };
  };
  const other: 1 | 2 = winner === 1 ? 2 : 1;
  return three ? [game(winner), game(other), game(winner)] : [game(winner), game(winner)];
}

const ROUNDS_FOR: Record<number, string[]> = { 8: ["QF", "SF", "F"], 16: ["R16", "QF", "SF", "F"] };

type DrawPlan = {
  discipline: Discipline;
  size: 8 | 16;
  // Day index (0 = first day) on which each round is played.
  roundDays: number[];
  // How far the draw has got: rounds before this are complete.
  completedRounds: number;
  // In the first incomplete round, this many matches are done and one is live.
  liveRound?: { done: number };
};

function buildDraw(
  rand: () => number,
  t: { key: string; startDate: string; timezone: string },
  plan: DrawPlan,
  entrants: NPlayer[][],
): NMatch[] {
  const rounds = ROUNDS_FOR[plan.size];
  const out: NMatch[] = [];
  let current: (NPlayer[] | null)[] = entrants;
  for (const [r, round] of rounds.entries()) {
    const next: (NPlayer[] | null)[] = [];
    const day = addDays(t.startDate, plan.roundDays[r]);
    for (let pos = 0; pos < current.length / 2; pos++) {
      const a = current[pos * 2];
      const b = current[pos * 2 + 1];
      // 10:00 venue time, then one slot per match across three courts.
      const slot = pos + out.length;
      const utcHour = 10 + Math.floor(slot / 3) - offsetHours(t.timezone, day);
      const [y, mo, d] = day.split("-").map(Number);
      const scheduledAt = new Date(Date.UTC(y, mo - 1, d, utcHour, slot % 2 ? 45 : 0));
      let status: NMatch["status"] = "scheduled";
      let games: GameScore[] = [];
      let winnerSide: 1 | 2 | null = null;
      const done =
        r < plan.completedRounds || (r === plan.completedRounds && plan.liveRound && pos < plan.liveRound.done);
      if (a && b && done) {
        winnerSide = rand() < 0.6 ? 1 : 2;
        games = playGames(rand, winnerSide);
        status = "completed";
      } else if (a && b && r === plan.completedRounds && plan.liveRound && pos === plan.liveRound.done) {
        status = "live";
        games = [
          { a: 21, b: 18 },
          { a: 9, b: 11 },
        ];
      }
      next.push(winnerSide === 1 ? a : winnerSide === 2 ? b : null);
      out.push({
        externalId: `${t.key}-${plan.discipline}-${round}-${pos}`,
        tournamentExternalId: t.key,
        discipline: plan.discipline,
        drawType: "main",
        drawSize: plan.size,
        round,
        bracketPosition: pos,
        court: `Court ${(slot % 3) + 1}`,
        scheduledAt,
        status,
        winnerSide,
        games,
        durationMin: status === "completed" ? 35 + Math.floor(rand() * 50) : null,
        sides: [
          ...(a ? [{ side: 1 as const, players: a, seed: r === 0 && pos === 0 ? "1" : null }] : []),
          ...(b
            ? [{ side: 2 as const, players: b, seed: r === 0 && pos === current.length / 2 - 1 ? "2" : null }]
            : []),
        ],
      });
    }
    current = next;
  }
  return out;
}

// Whole-hour UTC offset of a zone on a day (sample data only needs whole hours).
function offsetHours(timeZone: string, day: string): number {
  const noon = new Date(`${day}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(noon);
  return Number(local) - 12;
}

async function clear(db: Db) {
  const rows = await db
    .select({ id: externalIds.entityId })
    .from(externalIds)
    .where(and(eq(externalIds.source, SOURCE), eq(externalIds.entityType, "tournament")));
  if (rows.length)
    await db.delete(tournaments).where(
      inArray(
        tournaments.id,
        rows.map((r) => r.id),
      ),
    );
  await db.delete(videos).where(eq(videos.channelTitle, "bmnt.live sample data"));
  await db.delete(externalIds).where(eq(externalIds.source, SOURCE));
}

async function seed(db: Db) {
  const rand = rng(42);
  const today = dateInZone(new Date(), "UTC");
  const men = makePlayers(rand, "M", 16, "demo");
  const women = makePlayers(rand, "F", 16, "demo");
  const cache = new IdCache();

  const defs: { t: NTournament; plans: DrawPlan[] }[] = [
    {
      t: {
        externalId: "demo-open",
        name: "Demo Open 2026 (sample data)",
        tier: "super_500",
        city: "Singapore",
        country: "SGP",
        timezone: "Asia/Singapore",
        startDate: addDays(today, -2),
        endDate: addDays(today, 1),
      },
      plans: [
        { discipline: "MS", size: 16, roundDays: [0, 1, 2, 3], completedRounds: 2, liveRound: { done: 1 } },
        { discipline: "WS", size: 16, roundDays: [0, 1, 2, 3], completedRounds: 2 },
        { discipline: "XD", size: 8, roundDays: [1, 2, 3], completedRounds: 1 },
      ],
    },
    {
      t: {
        externalId: "demo-masters",
        name: "Demo Masters 2026 (sample data)",
        tier: "super_300",
        city: "Copenhagen",
        country: "DEN",
        timezone: "Europe/Copenhagen",
        startDate: addDays(today, -20),
        endDate: addDays(today, -16),
      },
      plans: [
        { discipline: "MS", size: 16, roundDays: [1, 2, 3, 4], completedRounds: 4 },
        { discipline: "WS", size: 16, roundDays: [1, 2, 3, 4], completedRounds: 4 },
        { discipline: "MD", size: 8, roundDays: [2, 3, 4], completedRounds: 3 },
      ],
    },
    {
      t: {
        externalId: "demo-international",
        name: "Demo International 2026 (sample data)",
        tier: "international_challenge",
        city: "Toronto",
        country: "CAN",
        timezone: "America/Toronto",
        startDate: addDays(today, 10),
        endDate: addDays(today, 14),
      },
      plans: [{ discipline: "MS", size: 16, roundDays: [1, 2, 3, 4], completedRounds: 0 }],
    },
  ];

  let count = 0;
  const ids: number[] = [];
  for (const { t, plans } of defs) {
    ids.push((await upsertTournament(db, SOURCE, t, cache)).id);
    for (const plan of plans) {
      const pool = plan.discipline === "WS" ? women : men;
      const shuffled = [...pool].sort(() => rand() - 0.5);
      let entrants: NPlayer[][];
      if (plan.discipline === "MS" || plan.discipline === "WS") entrants = shuffled.slice(0, plan.size).map((p) => [p]);
      else if (plan.discipline === "XD")
        entrants = Array.from({ length: plan.size }, (_, i) => [men[i], women[(i + 5) % women.length]]);
      else entrants = Array.from({ length: plan.size }, (_, i) => [shuffled[i * 2], shuffled[i * 2 + 1]]);
      const list = buildDraw(rand, { key: t.externalId, startDate: t.startDate, timezone: t.timezone }, plan, entrants);
      for (const m of list) await upsertMatch(db, SOURCE, m, cache);
      count += list.length;
    }
  }

  // One sample video per finished final, so match pages show the embed. The IDs are
  // placeholders, not real YouTube videos.
  const finals = await db.query.matches.findMany({
    where: (m, { and, eq, inArray }) => and(inArray(m.tournamentId, ids), eq(m.round, "F"), eq(m.status, "completed")),
  });
  for (const [i, f] of finals.entries()) {
    const [v] = await db
      .insert(videos)
      .values({
        youtubeId: `demoVideo${String(i).padStart(2, "0")}`,
        channelTitle: "bmnt.live sample data",
        title: `Sample final video ${i + 1} (placeholder)`,
        kind: "vod",
        publishedAt: f.scheduledAt,
        durationSec: 3600,
      })
      .onConflictDoNothing()
      .returning({ id: videos.id });
    if (v) {
      await db
        .insert(videoLinks)
        .values({ videoId: v.id, matchId: f.id, origin: "admin", status: "approved", offsetSec: 95 })
        .onConflictDoNothing();
    }
  }
  return count;
}

async function main() {
  const db = createDb();
  try {
    await clear(db);
    if (process.argv.includes("--clear")) {
      console.log("sample data removed");
      return;
    }
    console.log(`sample data loaded: ${await seed(db)} matches`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
