import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { channels, matches, matchSides, players, tournaments, videoLinks, videos, type VideoKind } from "@/db/schema";
import { addDays, dateInZone, parseIsoDuration } from "@/lib/time";
import { bestMatch, parseVideoTitle, tournamentNameScore, type CandidateMatch } from "../match-videos";
import { DEFAULT_CHANNELS } from "../sources/youtube/channels";
import { YouTubeClient, type VideoItem } from "../sources/youtube/client";
import type { UpsertStats } from "../types";

// Shorts and clips this short are never full matches or court streams.
const MIN_DURATION_SEC = 90;
// Below this a finished video is treated as highlights rather than a full match.
const HIGHLIGHT_MAX_SEC = 20 * 60;

export function videoKind(v: VideoItem): VideoKind {
  const live = v.snippet.liveBroadcastContent;
  if (live === "live") return "live";
  if (live === "upcoming") return "upcoming";
  if (v.liveStreamingDetails?.actualStartTime) return "vod";
  const dur = parseIsoDuration(v.contentDetails?.duration) ?? 0;
  return dur && dur < HIGHLIGHT_MAX_SEC ? "highlight" : "vod";
}

function keep(v: VideoItem): boolean {
  const kind = videoKind(v);
  if (kind === "live" || kind === "upcoming") return true;
  const dur = parseIsoDuration(v.contentDetails?.duration) ?? 0;
  return dur >= MIN_DURATION_SEC && !/#shorts?\b/i.test(v.snippet.title);
}

// The moment a video is "about": stream start when there is one, else publish time.
function videoTime(v: { liveStartedAt: Date | null; publishedAt: Date | null }): Date {
  return v.liveStartedAt ?? v.publishedAt ?? new Date();
}

export async function ensureDefaultChannels(db: Db, yt: YouTubeClient) {
  const known = await db.select({ id: channels.youtubeChannelId }).from(channels);
  const missing = DEFAULT_CHANNELS.filter((c) => !known.some((k) => k.id === c.youtubeChannelId));
  if (!missing.length) return 0;
  const info = await yt.channels({ id: missing.map((c) => c.youtubeChannelId).join(",") });
  for (const c of info) {
    await addChannelRow(
      db,
      c.id,
      c.snippet.title,
      c.snippet.customUrl ?? null,
      c.contentDetails.relatedPlaylists.uploads,
    );
  }
  return info.length;
}

async function addChannelRow(db: Db, id: string, name: string, handle: string | null, uploads: string) {
  await db
    .insert(channels)
    .values({ youtubeChannelId: id, name, handle, uploadsPlaylistId: uploads })
    .onConflictDoUpdate({
      target: channels.youtubeChannelId,
      set: { name, handle, uploadsPlaylistId: uploads, updatedAt: new Date() },
    });
}

export async function addChannel(db: Db, yt: YouTubeClient, ref: string) {
  const found = await yt.channels(ref.startsWith("@") ? { forHandle: ref } : { id: ref });
  if (!found.length) throw new Error(`no YouTube channel found for ${ref}`);
  const c = found[0];
  await addChannelRow(
    db,
    c.id,
    c.snippet.title,
    c.snippet.customUrl ?? null,
    c.contentDetails.relatedPlaylists.uploads,
  );
  return c.snippet.title;
}

export async function upsertVideo(db: Db, v: VideoItem, channelRowId: number | null) {
  const thumbs = v.snippet.thumbnails ?? {};
  const values = {
    channelId: channelRowId,
    channelTitle: v.snippet.channelTitle ?? null,
    title: v.snippet.title,
    description: v.snippet.description.slice(0, 5000),
    kind: videoKind(v),
    publishedAt: new Date(v.snippet.publishedAt),
    liveStartedAt: v.liveStreamingDetails?.actualStartTime ? new Date(v.liveStreamingDetails.actualStartTime) : null,
    liveEndedAt: v.liveStreamingDetails?.actualEndTime ? new Date(v.liveStreamingDetails.actualEndTime) : null,
    durationSec: parseIsoDuration(v.contentDetails?.duration),
    thumbnailUrl: (thumbs.medium ?? thumbs.high ?? thumbs.default)?.url ?? null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(videos)
    .values({ youtubeId: v.id, ...values })
    .onConflictDoUpdate({ target: videos.youtubeId, set: values })
    .returning({ id: videos.id });
  return row.id;
}

type LinkStats = { matchLinks: number; courtLinks: number; tournamentLinks: number; pending: number };

/**
 * Links one stored video to a match, a court stream slot, or a tournament.
 * Never touches links a person created or reviewed.
 */
export async function linkVideo(db: Db, videoId: number, stats: LinkStats) {
  const [v] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!v?.title) return;
  const title = parseVideoTitle(v.title);
  if (!title.sides && !title.court && !title.tournament) return;

  const when = videoTime(v);
  const day = when.toISOString().slice(0, 10);
  const nearby = await db
    .select()
    .from(tournaments)
    .where(and(lte(tournaments.startDate, addDays(day, 2)), gte(tournaments.endDate, addDays(day, -3))));

  const matched = nearby.filter(
    (t) =>
      title.tournament &&
      tournamentNameScore(title.tournament.name, t.name) >= 0.75 &&
      (!title.tournament.year ||
        t.startDate.startsWith(String(title.tournament.year)) ||
        t.endDate.startsWith(String(title.tournament.year))),
  );
  const matchedIds = new Set(matched.map((t) => t.id));

  // Reviewed or hand-made links win over anything automatic.
  const existing = await db.select().from(videoLinks).where(eq(videoLinks.videoId, videoId));
  if (existing.some((l) => l.origin !== "auto" || l.status === "rejected")) return;
  // Re-derive automatic links from scratch so a better match replaces a stale one.
  if (existing.length) await db.delete(videoLinks).where(eq(videoLinks.videoId, videoId));

  if (title.court && matched.length === 1) {
    const t = matched[0];
    // "Day 2" in the title is reliable even before an upcoming stream has started.
    const streamDay = title.day ? addDays(t.startDate, title.day - 1) : dateInZone(when, t.timezone);
    await db
      .insert(videoLinks)
      .values({
        videoId,
        tournamentId: t.id,
        day: streamDay,
        court: title.court,
        origin: "auto",
        status: "approved",
        confidence: 0.9,
      })
      .onConflictDoNothing();
    stats.courtLinks++;
    return;
  }

  if (title.sides) {
    const pool = matched.length ? matched : nearby;
    const candidates = await loadCandidates(
      db,
      pool.map((t) => t.id),
      when,
    );
    const verdict = bestMatch(title, candidates, { matchedTournaments: matchedIds, videoTime: when });
    if (verdict) {
      await db
        .insert(videoLinks)
        .values({
          videoId,
          matchId: verdict.matchId,
          origin: "auto",
          status: verdict.status,
          confidence: verdict.score,
        })
        .onConflictDoNothing();
      if (verdict.status === "pending") stats.pending++;
      else stats.matchLinks++;
      return;
    }
  }

  // Named the tournament but no match row to attach to (e.g. draws not ingested yet):
  // still list it on the tournament's Watch tab.
  if (matched.length === 1) {
    const t = matched[0];
    await db
      .insert(videoLinks)
      .values({
        videoId,
        tournamentId: t.id,
        day: dateInZone(when, t.timezone),
        origin: "auto",
        status: "approved",
        confidence: 0.75,
      })
      .onConflictDoNothing();
    stats.tournamentLinks++;
  }
}

async function loadCandidates(db: Db, tournamentIds: number[], when: Date): Promise<CandidateMatch[]> {
  if (!tournamentIds.length) return [];
  const from = new Date(when.getTime() - 4 * 86_400_000);
  const to = new Date(when.getTime() + 86_400_000);
  const rows = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      round: matches.round,
      scheduledAt: matches.scheduledAt,
      side: matchSides.side,
      name: players.name,
      lastName: players.lastName,
    })
    .from(matches)
    .innerJoin(matchSides, eq(matchSides.matchId, matches.id))
    .innerJoin(players, eq(players.id, matchSides.playerId))
    .where(
      and(
        inArray(matches.tournamentId, tournamentIds),
        or(
          and(gte(matches.scheduledAt, from), lte(matches.scheduledAt, to)),
          // Unscheduled rows still count when the tournament matched.
          eq(matches.status, "completed"),
        ),
      ),
    );
  const byId = new Map<number, CandidateMatch>();
  for (const r of rows) {
    let m = byId.get(r.id);
    if (!m) {
      m = { id: r.id, tournamentId: r.tournamentId, round: r.round, scheduledAt: r.scheduledAt, sides: [] };
      byId.set(r.id, m);
    }
    let side = m.sides.find((s) => s.side === r.side);
    if (!side) {
      side = { side: r.side, players: [] };
      m.sides.push(side);
    }
    side.players.push({ name: r.name, lastName: r.lastName });
  }
  return [...byId.values()];
}

export async function syncYouTube(db: Db, apiKey: string, opts: { pages?: number } = {}): Promise<UpsertStats> {
  const yt = new YouTubeClient(apiKey, db);
  const stats: UpsertStats = { channels: 0, fetched: 0, stored: 0 };
  const linkStats: LinkStats = { matchLinks: 0, courtLinks: 0, tournamentLinks: 0, pending: 0 };
  await ensureDefaultChannels(db, yt);

  const active = await db.select().from(channels).where(eq(channels.active, true));
  const ids = new Set<string>();
  for (const c of active) {
    if (!c.uploadsPlaylistId) continue;
    stats.channels++;
    let token: string | undefined;
    for (let page = 0; page < (opts.pages ?? 1); page++) {
      const res = await yt.playlistVideoIds(c.uploadsPlaylistId, token);
      res.ids.forEach((id) => ids.add(id));
      if (!res.next) break;
      token = res.next;
    }
  }
  // Streams change state (upcoming -> live -> ended), so re-check those we hold.
  const open = await db
    .select({ youtubeId: videos.youtubeId })
    .from(videos)
    .where(inArray(videos.kind, ["live", "upcoming"]));
  open.forEach((v) => ids.add(v.youtubeId));

  const items = await yt.videos([...ids]);
  stats.fetched = items.length;
  const channelRows = new Map(active.map((c) => [c.youtubeChannelId, c.id]));
  for (const item of items) {
    if (!keep(item)) continue;
    const id = await upsertVideo(db, item, channelRows.get(item.snippet.channelId) ?? null);
    stats.stored++;
    await linkVideo(db, id, linkStats);
  }
  return { ...stats, ...linkStats };
}
