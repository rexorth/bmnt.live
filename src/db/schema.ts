import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type Discipline = "MS" | "WS" | "MD" | "WD" | "XD";
export type DrawType = "main" | "qualifying";
export type MatchStatus = "scheduled" | "live" | "completed" | "walkover" | "retired" | "cancelled";
export type GameScore = { a: number; b: number };
export type VideoKind = "live" | "upcoming" | "vod" | "highlight";
export type LinkOrigin = "auto" | "user" | "admin";
export type LinkStatus = "approved" | "pending" | "rejected";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tournaments = pgTable(
  "tournaments",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Lower-cased, accent-free copy of name for trigram search.
    nameSearch: text("name_search").notNull(),
    // e.g. super_1000, super_300, international_challenge (see lib/tiers.ts)
    tier: text("tier").notNull().default("other"),
    city: text("city"),
    country: text("country"),
    venue: text("venue"),
    // IANA zone of the venue; all match times are stored in UTC.
    timezone: text("timezone").notNull().default("UTC"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Only set for overrides (cancelled, postponed); otherwise derived from dates.
    statusOverride: text("status_override"),
    prizeMoney: text("prize_money"),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tournaments_slug_idx").on(t.slug),
    index("tournaments_dates_idx").on(t.startDate, t.endDate),
    index("tournaments_name_trgm_idx").using("gin", sql`${t.nameSearch} gin_trgm_ops`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    discipline: text("discipline").$type<Discipline>().notNull(),
    drawType: text("draw_type").$type<DrawType>().notNull().default("main"),
    drawSize: integer("draw_size"),
  },
  (t) => [uniqueIndex("events_unique_idx").on(t.tournamentId, t.discipline, t.drawType)],
);

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Family name as published, used for title matching and short labels.
    lastName: text("last_name"),
    nameSearch: text("name_search").notNull(),
    country: text("country"),
    gender: text("gender").$type<"M" | "F">(),
    photoUrl: text("photo_url"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("players_slug_idx").on(t.slug),
    index("players_name_trgm_idx").using("gin", sql`${t.nameSearch} gin_trgm_ops`),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // R64, R32, R16, QF, SF, F, Q1, Q2... (see lib/rounds.ts)
    round: text("round").notNull(),
    // 0 = first round of the draw; used to order bracket columns.
    roundIndex: integer("round_index").notNull(),
    bracketPosition: integer("bracket_position"),
    court: text("court"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // Observed by the live job; tighter than the published schedule.
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status").$type<MatchStatus>().notNull().default("scheduled"),
    winnerSide: smallint("winner_side"),
    games: jsonb("games").$type<GameScore[]>().notNull().default([]),
    durationMin: integer("duration_min"),
    ...timestamps,
  },
  (t) => [
    index("matches_tournament_idx").on(t.tournamentId, t.scheduledAt),
    index("matches_event_idx").on(t.eventId, t.roundIndex),
    index("matches_status_idx").on(t.status),
    index("matches_scheduled_idx").on(t.scheduledAt),
  ],
);

export const matchSides = pgTable(
  "match_sides",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    side: smallint("side").notNull(),
    // 0, or 1 for the second doubles partner.
    slot: smallint("slot").notNull(),
    playerId: integer("player_id").references(() => players.id, { onDelete: "set null" }),
    seed: text("seed"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.side, t.slot] }), index("match_sides_player_idx").on(t.playerId)],
);

export const channels = pgTable(
  "channels",
  {
    id: serial("id").primaryKey(),
    youtubeChannelId: text("youtube_channel_id").notNull(),
    name: text("name").notNull(),
    handle: text("handle"),
    uploadsPlaylistId: text("uploads_playlist_id"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("channels_youtube_idx").on(t.youtubeChannelId)],
);

export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    youtubeId: text("youtube_id").notNull(),
    channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
    channelTitle: text("channel_title"),
    title: text("title"),
    description: text("description"),
    kind: text("kind").$type<VideoKind>().notNull().default("vod"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
    liveEndedAt: timestamp("live_ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    thumbnailUrl: text("thumbnail_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("videos_youtube_idx").on(t.youtubeId), index("videos_published_idx").on(t.publishedAt)],
);

export const videoLinks = pgTable(
  "video_links",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    // A single match; or, with matchId empty, a tournament-wide video
    // (optionally narrowed to one day and court for all-day court streams).
    matchId: integer("match_id").references(() => matches.id, { onDelete: "cascade" }),
    tournamentId: integer("tournament_id").references(() => tournaments.id, {
      onDelete: "cascade",
    }),
    day: date("day"),
    court: text("court"),
    // Seconds into the video where the match starts, when known.
    offsetSec: integer("offset_sec"),
    confidence: real("confidence"),
    origin: text("origin").$type<LinkOrigin>().notNull(),
    status: text("status").$type<LinkStatus>().notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    // One row per video and scope (a match, or a tournament day/court).
    unique("video_links_scope_unique").on(t.videoId, t.matchId, t.tournamentId, t.day, t.court).nullsNotDistinct(),
    index("video_links_match_lookup_idx").on(t.matchId, t.status),
    index("video_links_court_idx").on(t.tournamentId, t.day, t.court),
    index("video_links_status_idx").on(t.status),
  ],
);

// Maps a source's own identifiers onto our rows so re-ingesting never duplicates.
export const externalIds = pgTable(
  "external_ids",
  {
    entityType: text("entity_type").$type<"tournament" | "player" | "match">().notNull(),
    entityId: integer("entity_id").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.entityType, t.externalId] }),
    index("external_ids_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const rawPayloads = pgTable(
  "raw_payloads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    url: text("url").notNull(),
    hash: text("hash").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("raw_payloads_url_idx").on(t.source, t.url, t.fetchedAt)],
);

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(),
    args: jsonb("args").$type<string[]>().notNull().default([]),
    status: text("status").$type<"running" | "ok" | "error">().notNull(),
    stats: jsonb("stats").$type<Record<string, number>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ingest_runs_job_idx").on(t.job, t.startedAt)],
);
