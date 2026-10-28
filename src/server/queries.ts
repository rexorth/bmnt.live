import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { io } from "next/cache";
import { getDb } from "@/db";
import {
  events,
  matches,
  matchSides,
  players,
  tournaments,
  videoLinks,
  videos,
  type Discipline,
  type DrawType,
  type GameScore,
  type MatchStatus,
} from "@/db/schema";
import { courtKey } from "@/ingest/match-videos";
import { parseDateQuery, type DateRange } from "@/lib/search-dates";
import { normalizeText } from "@/lib/text";
import { addDays, tournamentStatus, type TournamentStatus } from "@/lib/time";

// Every read goes through here: io() keeps database access out of build-time
// prerendering, so pages always show current data.
async function db() {
  await io();
  return getDb();
}

export type PlayerRef = { id: number; slug: string; name: string; lastName: string | null; country: string | null };
export type SideCard = { side: 1 | 2; seed: string | null; players: PlayerRef[] };
export type MatchCard = {
  id: number;
  round: string;
  roundIndex: number;
  bracketPosition: number | null;
  status: MatchStatus;
  court: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  winnerSide: number | null;
  games: GameScore[];
  durationMin: number | null;
  discipline: Discipline;
  drawType: DrawType;
  tournament: { id: number; slug: string; name: string; timezone: string };
  sides: SideCard[];
  videoCount: number;
};

export type TournamentRow = typeof tournaments.$inferSelect & { status: TournamentStatus };

function withStatus(t: typeof tournaments.$inferSelect, now = new Date()): TournamentRow {
  return { ...t, status: tournamentStatus(t, now) };
}

async function loadMatchCards(where: SQL | undefined, order: SQL[], limit?: number): Promise<MatchCard[]> {
  const conn = await db();
  const q = conn
    .select({
      m: matches,
      discipline: events.discipline,
      drawType: events.drawType,
      t: { id: tournaments.id, slug: tournaments.slug, name: tournaments.name, timezone: tournaments.timezone },
    })
    .from(matches)
    .innerJoin(events, eq(events.id, matches.eventId))
    .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
    .where(where)
    .orderBy(...order);
  const rows = limit ? await q.limit(limit) : await q;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.m.id);
  const [sides, counts] = await Promise.all([
    conn
      .select({
        matchId: matchSides.matchId,
        side: matchSides.side,
        slot: matchSides.slot,
        seed: matchSides.seed,
        p: {
          id: players.id,
          slug: players.slug,
          name: players.name,
          lastName: players.lastName,
          country: players.country,
        },
      })
      .from(matchSides)
      .innerJoin(players, eq(players.id, matchSides.playerId))
      .where(inArray(matchSides.matchId, ids))
      .orderBy(asc(matchSides.side), asc(matchSides.slot)),
    conn
      .select({ matchId: videoLinks.matchId, n: sql<number>`count(*)::int` })
      .from(videoLinks)
      .where(and(inArray(videoLinks.matchId, ids), eq(videoLinks.status, "approved")))
      .groupBy(videoLinks.matchId),
  ]);
  const sideMap = new Map<number, SideCard[]>();
  for (const s of sides) {
    const list = sideMap.get(s.matchId) ?? [];
    let card = list.find((c) => c.side === s.side);
    if (!card) {
      card = { side: s.side as 1 | 2, seed: s.seed, players: [] };
      list.push(card);
    }
    card.players.push(s.p);
    sideMap.set(s.matchId, list);
  }
  const countMap = new Map(counts.map((c) => [c.matchId, c.n]));
  return rows.map(({ m, discipline, drawType, t }) => ({
    id: m.id,
    round: m.round,
    roundIndex: m.roundIndex,
    bracketPosition: m.bracketPosition,
    status: m.status,
    court: m.court,
    scheduledAt: m.scheduledAt,
    startedAt: m.startedAt,
    winnerSide: m.winnerSide,
    games: m.games,
    durationMin: m.durationMin,
    discipline,
    drawType,
    tournament: t,
    sides: sideMap.get(m.id) ?? [],
    videoCount: countMap.get(m.id) ?? 0,
  }));
}

export async function getHomeData() {
  const conn = await db();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [live, upNext, recent, nearby] = await Promise.all([
    loadMatchCards(eq(matches.status, "live"), [asc(matches.scheduledAt)], 30),
    loadMatchCards(
      and(
        eq(matches.status, "scheduled"),
        gte(matches.scheduledAt, now),
        lte(matches.scheduledAt, new Date(now.getTime() + 36 * 3_600_000)),
      ),
      [asc(matches.scheduledAt)],
      40,
    ),
    loadMatchCards(
      and(
        inArray(matches.status, ["completed", "retired", "walkover"]),
        gte(matches.scheduledAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
      [desc(matches.scheduledAt)],
      15,
    ),
    conn
      .select()
      .from(tournaments)
      .where(and(lte(tournaments.startDate, addDays(today, 60)), gte(tournaments.endDate, addDays(today, -14))))
      .orderBy(asc(tournaments.startDate)),
  ]);
  const ts = nearby.map((t) => withStatus(t, now));
  return {
    live,
    // Later-round slots with no players yet aren't worth a line on the home page.
    upNext: upNext.filter((m) => m.sides.length === 2).slice(0, 12),
    recent,
    liveTournaments: ts.filter((t) => t.status === "live"),
    upcomingTournaments: ts.filter((t) => t.status === "upcoming").slice(0, 8),
    recentTournaments: ts
      .filter((t) => t.status === "completed")
      .reverse()
      .slice(0, 6),
  };
}

export type TournamentFilters = { range?: DateRange | null; tier?: string; status?: TournamentStatus; q?: string };

export async function listTournaments(f: TournamentFilters) {
  const conn = await db();
  const conds: SQL[] = [];
  if (f.range) conds.push(lte(tournaments.startDate, f.range.to), gte(tournaments.endDate, f.range.from));
  if (f.tier) conds.push(eq(tournaments.tier, f.tier));
  if (f.q) {
    const q = normalizeText(f.q);
    if (q)
      conds.push(
        or(
          sql`${tournaments.nameSearch} ilike ${"%" + q + "%"}`,
          sql`word_similarity(${q}, ${tournaments.nameSearch}) > 0.4`,
        )!,
      );
  }
  const rows = await conn
    .select()
    .from(tournaments)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(tournaments.startDate))
    .limit(300);
  const now = new Date();
  const list = rows.map((t) => withStatus(t, now));
  return f.status ? list.filter((t) => t.status === f.status) : list;
}

export async function getTournament(slug: string) {
  const conn = await db();
  const [t] = await conn.select().from(tournaments).where(eq(tournaments.slug, slug));
  if (!t) return null;
  const evs = await conn.select().from(events).where(eq(events.tournamentId, t.id));
  return { ...withStatus(t), events: evs };
}

export async function getTournamentMatches(tournamentId: number) {
  return loadMatchCards(eq(matches.tournamentId, tournamentId), [
    asc(matches.scheduledAt),
    asc(matches.roundIndex),
    asc(matches.bracketPosition),
    asc(matches.id),
  ]);
}

export type VideoCard = {
  linkId: number;
  youtubeId: string;
  title: string | null;
  channelTitle: string | null;
  kind: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  liveStartedAt: Date | null;
  durationSec: number | null;
  day: string | null;
  court: string | null;
  offsetSec: number | null;
  matchId: number | null;
  origin: string;
};

const videoCardFields = {
  linkId: videoLinks.id,
  youtubeId: videos.youtubeId,
  title: videos.title,
  channelTitle: videos.channelTitle,
  kind: videos.kind,
  thumbnailUrl: videos.thumbnailUrl,
  publishedAt: videos.publishedAt,
  liveStartedAt: videos.liveStartedAt,
  durationSec: videos.durationSec,
  day: videoLinks.day,
  court: videoLinks.court,
  offsetSec: videoLinks.offsetSec,
  matchId: videoLinks.matchId,
  origin: videoLinks.origin,
};

// Court streams, tournament-wide videos, and videos linked to its matches.
export async function getTournamentVideos(tournamentId: number): Promise<VideoCard[]> {
  const conn = await db();
  return conn
    .select(videoCardFields)
    .from(videoLinks)
    .innerJoin(videos, eq(videos.id, videoLinks.videoId))
    .leftJoin(matches, eq(matches.id, videoLinks.matchId))
    .where(
      and(
        eq(videoLinks.status, "approved"),
        or(eq(videoLinks.tournamentId, tournamentId), eq(matches.tournamentId, tournamentId)),
      ),
    )
    .orderBy(desc(videoLinks.day), asc(videoLinks.court), desc(videos.publishedAt));
}

// How far into a court stream a match should start: a little before its time,
// or ten minutes before we first saw it live (the live job polls every ten).
export function courtStreamOffset(
  liveStartedAt: Date | null,
  match: { startedAt: Date | null; scheduledAt: Date | null },
) {
  const at = match.startedAt ?? match.scheduledAt;
  if (!liveStartedAt || !at) return null;
  const lead = match.startedAt ? 600 : 120;
  return Math.max(0, Math.round((at.getTime() - liveStartedAt.getTime()) / 1000) - lead);
}

export async function getMatch(id: number) {
  const [card] = await loadMatchCards(eq(matches.id, id), [asc(matches.id)]);
  if (!card) return null;
  const conn = await db();
  const [t] = await conn.select().from(tournaments).where(eq(tournaments.id, card.tournament.id));
  const direct = await conn
    .select(videoCardFields)
    .from(videoLinks)
    .innerJoin(videos, eq(videos.id, videoLinks.videoId))
    .where(and(eq(videoLinks.matchId, id), eq(videoLinks.status, "approved")))
    .orderBy(desc(videos.durationSec));

  // All-day court streams covering this match's court and day.
  let courtStreams: (VideoCard & { suggestedOffset: number | null })[] = [];
  const key = courtKey(card.court);
  const when = card.startedAt ?? card.scheduledAt;
  if (key && when) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: t.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
    const rows = await conn
      .select(videoCardFields)
      .from(videoLinks)
      .innerJoin(videos, eq(videos.id, videoLinks.videoId))
      .where(
        and(
          eq(videoLinks.tournamentId, t.id),
          eq(videoLinks.day, day),
          eq(videoLinks.court, key),
          eq(videoLinks.status, "approved"),
        ),
      );
    courtStreams = rows.map((r) => ({ ...r, suggestedOffset: courtStreamOffset(r.liveStartedAt, card) }));
  }

  return {
    match: card,
    tournament: withStatus(t),
    videos: direct,
    courtStreams,
    headToHead: await getHeadToHead(card),
  };
}

// Earlier meetings between exactly these two sides (singles, or the same pairs).
async function getHeadToHead(card: MatchCard): Promise<MatchCard[]> {
  const [a, b] = card.sides;
  if (!a || !b || !a.players.length || !b.players.length) return [];
  const conn = await db();
  const playerIds = [...a.players, ...b.players].map((p) => p.id);
  const candidates = await conn
    .select({ matchId: matchSides.matchId })
    .from(matchSides)
    .where(inArray(matchSides.playerId, playerIds))
    .groupBy(matchSides.matchId)
    .having(sql`count(distinct ${matchSides.playerId}) = ${playerIds.length}`);
  const ids = candidates.map((c) => c.matchId).filter((m) => m !== card.id);
  if (!ids.length) return [];
  return loadMatchCards(
    and(inArray(matches.id, ids), ne(matches.status, "scheduled")),
    [desc(matches.scheduledAt)],
    10,
  );
}

export async function getPlayer(slug: string) {
  const conn = await db();
  const [p] = await conn.select().from(players).where(eq(players.slug, slug));
  if (!p) return null;
  const ids = await conn.select({ matchId: matchSides.matchId }).from(matchSides).where(eq(matchSides.playerId, p.id));
  const list = ids.length
    ? await loadMatchCards(
        inArray(
          matches.id,
          ids.map((i) => i.matchId),
        ),
        [desc(matches.scheduledAt)],
        200,
      )
    : [];
  const partners = new Map<number, { player: PlayerRef; matches: number }>();
  for (const m of list) {
    const mine = m.sides.find((s) => s.players.some((x) => x.id === p.id));
    for (const x of mine?.players ?? []) {
      if (x.id === p.id) continue;
      const cur = partners.get(x.id) ?? { player: x, matches: 0 };
      cur.matches++;
      partners.set(x.id, cur);
    }
  }
  const finished = list.filter((m) => m.winnerSide);
  const wins = finished.filter((m) =>
    m.sides.find((s) => s.side === m.winnerSide)?.players.some((x) => x.id === p.id),
  ).length;
  return {
    player: p,
    upcoming: list.filter((m) => m.status === "scheduled" || m.status === "live").reverse(),
    results: list.filter((m) => m.status !== "scheduled" && m.status !== "live"),
    partners: [...partners.values()].sort((a, b) => b.matches - a.matches),
    record: { wins, losses: finished.length - wins },
  };
}

export async function search(query: string) {
  const conn = await db();
  const { range, rest } = parseDateQuery(query, new Date());
  const q = normalizeText(rest);
  const like = "%" + q + "%";
  const [ps, ts] = await Promise.all([
    q.length >= 2
      ? conn
          .select({ slug: players.slug, name: players.name, country: players.country })
          .from(players)
          .where(or(sql`${players.nameSearch} ilike ${like}`, sql`word_similarity(${q}, ${players.nameSearch}) > 0.45`))
          .orderBy(sql`word_similarity(${q}, ${players.nameSearch}) desc`, asc(players.name))
          .limit(20)
      : Promise.resolve([]),
    q.length >= 2 || range ? listTournaments({ range, q: q.length >= 2 ? q : undefined }) : Promise.resolve([]),
  ]);
  return { players: ps, tournaments: ts, range, text: rest };
}

export async function getPendingLinks() {
  const conn = await db();
  return conn
    .select({
      ...videoCardFields,
      status: videoLinks.status,
      confidence: videoLinks.confidence,
      note: videoLinks.note,
      createdAt: videoLinks.createdAt,
      matchRound: matches.round,
      tournamentName: tournaments.name,
      tournamentSlug: tournaments.slug,
    })
    .from(videoLinks)
    .innerJoin(videos, eq(videos.id, videoLinks.videoId))
    .leftJoin(matches, eq(matches.id, videoLinks.matchId))
    .leftJoin(tournaments, eq(tournaments.id, sql`coalesce(${videoLinks.tournamentId}, ${matches.tournamentId})`))
    .where(eq(videoLinks.status, "pending"))
    .orderBy(asc(videoLinks.createdAt))
    .limit(200);
}
