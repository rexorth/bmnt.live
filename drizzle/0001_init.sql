CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"youtube_channel_id" text NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"uploads_playlist_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"discipline" text NOT NULL,
	"draw_type" text DEFAULT 'main' NOT NULL,
	"draw_size" integer
);
--> statement-breakpoint
CREATE TABLE "external_ids" (
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	CONSTRAINT "external_ids_source_entity_type_external_id_pk" PRIMARY KEY("source","entity_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"stats" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_sides" (
	"match_id" integer NOT NULL,
	"side" smallint NOT NULL,
	"slot" smallint NOT NULL,
	"player_id" integer,
	"seed" text,
	CONSTRAINT "match_sides_match_id_side_slot_pk" PRIMARY KEY("match_id","side","slot")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"round" text NOT NULL,
	"round_index" integer NOT NULL,
	"bracket_position" integer,
	"court" text,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"winner_side" smallint,
	"games" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_min" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"last_name" text,
	"name_search" text NOT NULL,
	"country" text,
	"gender" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_search" text NOT NULL,
	"tier" text DEFAULT 'other' NOT NULL,
	"city" text,
	"country" text,
	"venue" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status_override" text,
	"prize_money" text,
	"logo_url" text,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"match_id" integer,
	"tournament_id" integer,
	"day" date,
	"court" text,
	"offset_sec" integer,
	"confidence" real,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_links_scope_unique" UNIQUE NULLS NOT DISTINCT("video_id","match_id","tournament_id","day","court")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"youtube_id" text NOT NULL,
	"channel_id" integer,
	"channel_title" text,
	"title" text,
	"description" text,
	"kind" text DEFAULT 'vod' NOT NULL,
	"published_at" timestamp with time zone,
	"live_started_at" timestamp with time zone,
	"live_ended_at" timestamp with time zone,
	"duration_sec" integer,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_links" ADD CONSTRAINT "video_links_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_links" ADD CONSTRAINT "video_links_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_links" ADD CONSTRAINT "video_links_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_youtube_idx" ON "channels" USING btree ("youtube_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_unique_idx" ON "events" USING btree ("tournament_id","discipline","draw_type");--> statement-breakpoint
CREATE INDEX "external_ids_entity_idx" ON "external_ids" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ingest_runs_job_idx" ON "ingest_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "match_sides_player_idx" ON "match_sides" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_tournament_idx" ON "matches" USING btree ("tournament_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_event_idx" ON "matches" USING btree ("event_id","round_index");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_scheduled_idx" ON "matches" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_slug_idx" ON "players" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "players_name_trgm_idx" ON "players" USING gin ("name_search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "raw_payloads_url_idx" ON "raw_payloads" USING btree ("source","url","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_slug_idx" ON "tournaments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tournaments_dates_idx" ON "tournaments" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "tournaments_name_trgm_idx" ON "tournaments" USING gin ("name_search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "video_links_match_lookup_idx" ON "video_links" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "video_links_court_idx" ON "video_links" USING btree ("tournament_id","day","court");--> statement-breakpoint
CREATE INDEX "video_links_status_idx" ON "video_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_youtube_idx" ON "videos" USING btree ("youtube_id");--> statement-breakpoint
CREATE INDEX "videos_published_idx" ON "videos" USING btree ("published_at");