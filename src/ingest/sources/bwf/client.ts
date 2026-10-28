import type { Db } from "@/db";
import { fetchJson } from "../../http";

const BASE = process.env.BWF_API_BASE ?? "https://extranet-lv.bwfbadminton.com/api";

// The one BWF endpoint confirmed publicly: a tournament's matches for one day.
// order=2 sorts by court, which is what the BWF site itself sends.
export function dayMatchesUrl(tournamentCode: string, date: string): string {
  const q = new URLSearchParams({ tournamentCode, date, order: "2" });
  return `${BASE}/tournaments/day-matches?${q}`;
}

export async function fetchDayMatches(tournamentCode: string, date: string, db?: Db) {
  return fetchJson(dayMatchesUrl(tournamentCode, date), {
    source: "bwf",
    db,
    minIntervalMs: 1000,
    headers: { referer: "https://bwfworldtour.bwfbadminton.com/" },
  });
}
