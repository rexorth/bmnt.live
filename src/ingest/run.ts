import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import { ingestRuns, videos } from "@/db/schema";
import { captureDayMatches, ingestLive, ingestRecent, ingestTournament } from "./jobs/bwf";
import { ingestCalendar } from "./jobs/calendar";
import { addChannel, linkVideo, syncYouTube } from "./jobs/youtube";
import { YouTubeClient } from "./sources/youtube/client";

const USAGE = `usage: pnpm ingest <job>
  calendar                 upsert tournaments from data/tournaments.json
  tournament <slug>        fetch every day of one tournament from BWF
  recent                   BWF results for tournaments within 7 days of today
  live                     today's BWF matches for tournaments in progress
  youtube [--pages N]      new uploads and streams from followed channels, then link them
  relink                   re-run video linking over every stored video
  add-channel <id|@handle> follow another YouTube channel
  capture <code> <date>    save a raw BWF day-matches response to tests/fixtures/bwf`;

function youtubeKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  return key;
}

async function main() {
  const [job, ...args] = process.argv.slice(2);
  if (!job || job === "help") {
    console.log(USAGE);
    return;
  }
  if (job === "capture") {
    const [code, date] = args;
    if (!code || !date) throw new Error("capture needs <tournamentCode> <YYYY-MM-DD>");
    console.log(await captureDayMatches(code, date));
    return;
  }

  const db = createDb();
  const [run] = await db.insert(ingestRuns).values({ job, args, status: "running" }).returning();
  try {
    let stats: Record<string, number>;
    switch (job) {
      case "calendar":
        stats = await ingestCalendar(db);
        break;
      case "tournament":
        if (!args[0]) throw new Error("tournament needs a slug");
        stats = await ingestTournament(db, args[0]);
        break;
      case "recent":
        stats = await ingestRecent(db);
        break;
      case "live":
        stats = await ingestLive(db);
        break;
      case "youtube": {
        const i = args.indexOf("--pages");
        stats = await syncYouTube(db, youtubeKey(), { pages: i >= 0 ? Number(args[i + 1]) : 1 });
        break;
      }
      case "relink": {
        const all = await db.select({ id: videos.id }).from(videos);
        const s = { matchLinks: 0, courtLinks: 0, tournamentLinks: 0, pending: 0 };
        for (const v of all) await linkVideo(db, v.id, s);
        stats = { videos: all.length, ...s };
        break;
      }
      case "add-channel":
        if (!args[0]) throw new Error("add-channel needs a channel id or @handle");
        console.log(`following ${await addChannel(db, new YouTubeClient(youtubeKey(), db), args[0])}`);
        stats = { channels: 1 };
        break;
      default:
        throw new Error(`unknown job "${job}"\n${USAGE}`);
    }
    await db.update(ingestRuns).set({ status: "ok", stats, finishedAt: new Date() }).where(eq(ingestRuns.id, run.id));
    console.log(job, stats);
  } catch (err) {
    await db
      .update(ingestRuns)
      .set({ status: "error", error: String(err instanceof Error ? err.stack : err), finishedAt: new Date() })
      .where(eq(ingestRuns.id, run.id));
    throw err;
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
