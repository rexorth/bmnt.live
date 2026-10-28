"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { matches, videoLinks, videos } from "@/db/schema";
import { upsertVideo } from "@/ingest/jobs/youtube";
import { YouTubeClient } from "@/ingest/sources/youtube/client";
import { parseYouTubeUrl } from "@/lib/youtube-url";

export type FormState = { ok: boolean; message: string } | null;

// A match can't collect more open suggestions than this before review.
const MAX_PENDING_PER_MATCH = 20;

export async function suggestVideo(_prev: FormState, form: FormData): Promise<FormState> {
  // Bots fill every field; people never see this one.
  if (form.get("website")) return { ok: true, message: "Thanks! It will appear once reviewed." };
  const matchId = Number(form.get("matchId"));
  const parsed = parseYouTubeUrl(String(form.get("url") ?? ""));
  if (!Number.isInteger(matchId) || matchId <= 0) return { ok: false, message: "Unknown match." };
  if (!parsed) return { ok: false, message: "That doesn't look like a YouTube link." };

  const db = getDb();
  const [match] = await db.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId));
  if (!match) return { ok: false, message: "Unknown match." };
  const [{ n }] = await db
    .select({ n: count() })
    .from(videoLinks)
    .where(and(eq(videoLinks.matchId, matchId), eq(videoLinks.status, "pending")));
  if (n >= MAX_PENDING_PER_MATCH)
    return { ok: false, message: "This match already has suggestions waiting for review." };

  // Check the video exists and store its details; without an API key, keep just the ID.
  let videoId: number;
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const [item] = await new YouTubeClient(key).videos([parsed.id]);
    if (!item) return { ok: false, message: "YouTube couldn't find that video." };
    videoId = await upsertVideo(db, item, null);
  } else {
    const [row] = await db
      .insert(videos)
      .values({ youtubeId: parsed.id })
      .onConflictDoUpdate({ target: videos.youtubeId, set: { updatedAt: new Date() } })
      .returning({ id: videos.id });
    videoId = row.id;
  }

  const [existing] = await db
    .select({ status: videoLinks.status })
    .from(videoLinks)
    .where(and(eq(videoLinks.videoId, videoId), eq(videoLinks.matchId, matchId)));
  if (existing?.status === "approved") return { ok: true, message: "That video is already linked to this match." };
  if (existing) return { ok: true, message: "That video has already been suggested. Thanks!" };

  const note = String(form.get("note") ?? "").slice(0, 300) || null;
  await db.insert(videoLinks).values({
    videoId,
    matchId,
    offsetSec: parsed.startSec,
    origin: "user",
    status: "pending",
    note,
  });
  return { ok: true, message: "Thanks! It will appear once reviewed." };
}

// ---- Admin ----

const COOKIE = "bmnt_admin";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function isAdmin(): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const got = (await cookies()).get(COOKIE)?.value;
  if (!got) return false;
  return timingSafeEqual(digest(got), digest(digest(token).toString("hex")));
}

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const token = process.env.ADMIN_TOKEN;
  const given = String(form.get("token") ?? "");
  if (!token || !timingSafeEqual(digest(given), digest(token))) return { ok: false, message: "Wrong token." };
  (await cookies()).set(COOKIE, digest(token).toString("hex"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/");
}

export async function reviewLink(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("linkId"));
  const decision = form.get("decision");
  if (!Number.isInteger(id) || (decision !== "approved" && decision !== "rejected")) return;
  const offset = String(form.get("offsetSec") ?? "").trim();
  await getDb()
    .update(videoLinks)
    .set({
      status: decision,
      // A reviewed automatic link becomes an admin decision, so the matcher leaves it alone.
      origin: "admin",
      ...(offset !== "" && /^\d+$/.test(offset) ? { offsetSec: Number(offset) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(videoLinks.id, id));
  redirect("/admin");
}
