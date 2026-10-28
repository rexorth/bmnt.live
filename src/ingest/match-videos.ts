/**
 * Pure title parsing and scoring for linking YouTube videos to matches.
 * Title formats seen on BWF TV (see tests/fixtures/youtube):
 *   "YONEX French Open 2026 | An Se Young (KOR) [1] vs Pusarla V. Sindhu (IND) | F"   full match
 *   "Goh/Izzuddin vs Man/Tee | Malaysian pairs go for gold"                          highlights
 *   "HYLO Open 2026 | Day 2 | Court 3 | Round of 32"                                 all-day court stream
 */
import { parseRound } from "@/lib/rounds";
import { normalizeText, tokens } from "@/lib/text";

export type ParsedTitle = {
  tournament: { name: string; year: number | null } | null;
  court: string | null;
  day: number | null;
  round: string | null;
  // Raw text of each side, e.g. "Goh/Izzuddin", "An Se Young".
  sides: [string, string] | null;
};

const SIDE_NOISE = /\([A-Z]{2,3}\)|\[[^\]]*\]/g;

export function parseVideoTitle(title: string): ParsedTitle {
  const segments = title
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed: ParsedTitle = { tournament: null, court: null, day: null, round: null, sides: null };
  for (const seg of segments) {
    const court = seg.match(/^court\s*(\w+)$/i);
    if (court) {
      parsed.court = courtKey(court[1]);
      continue;
    }
    const day = seg.match(/^day\s*(\d+)$/i);
    if (day) {
      parsed.day = Number(day[1]);
      continue;
    }
    if (/\svs\.?\s/i.test(seg) && !parsed.sides) {
      const [left, right] = seg.split(/\svs\.?\s/i);
      parsed.sides = [left.replace(SIDE_NOISE, "").trim(), right.replace(SIDE_NOISE, "").trim()];
      continue;
    }
    // "Qualification/Round of 32" -> take the last round named.
    const rounds = seg
      .split("/")
      .map((p) => parseRound(p))
      .filter(Boolean);
    if (rounds.length && !parsed.round) {
      parsed.round = rounds.at(-1) ?? null;
      continue;
    }
    const year = seg.match(/\b(20\d{2})\b/);
    if (year && !parsed.tournament) {
      parsed.tournament = { name: seg, year: Number(year[1]) };
    }
  }
  return parsed;
}

// "Court 1", "1", "C1" -> "1"; anything else is kept lower-cased.
export function courtKey(court: string | null | undefined): string | null {
  if (!court) return null;
  const digits = court.match(/\d+/);
  return digits ? String(Number(digits[0])) : normalizeText(court) || null;
}

const YEAR = /^20\d{2}$/;

// Share of the shorter name's words found in the longer one, ignoring years.
export function tournamentNameScore(titleName: string, dbName: string): number {
  const a = new Set(tokens(titleName).filter((t) => !YEAR.test(t)));
  const b = new Set(tokens(dbName).filter((t) => !YEAR.test(t)));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

export type CandidatePlayer = { name: string; lastName: string | null };
export type CandidateMatch = {
  id: number;
  tournamentId: number;
  round: string;
  scheduledAt: Date | null;
  sides: { side: number; players: CandidatePlayer[] }[];
};

function playerInSide(p: CandidatePlayer, sideTokens: Set<string>): boolean {
  const last = p.lastName ? tokens(p.lastName) : [];
  if (last.length && last.every((t) => sideTokens.has(t))) return true;
  const all = tokens(p.name).filter((t) => t.length > 1);
  if (!all.length) return false;
  const found = all.filter((t) => sideTokens.has(t)).length;
  return found / all.length >= 0.5;
}

// 1 if every player of the side appears in the title text, 0.5 if some do, else 0.
function sideScore(players: CandidatePlayer[], text: string): number {
  if (!players.length) return 0;
  const sideTokens = new Set(tokens(text));
  const hits = players.filter((p) => playerInSide(p, sideTokens)).length;
  return hits === players.length ? 1 : hits > 0 ? 0.5 : 0;
}

export const AUTO_APPROVE = 0.8;
export const MIN_SCORE = 0.5;

/**
 * Scores one candidate match for a parsed title. Both named sides count most;
 * agreement on round, tournament and timing push it over the auto-approve line.
 */
export function scoreMatch(
  title: ParsedTitle,
  m: CandidateMatch,
  ctx: { tournamentMatched: boolean; videoTime: Date },
): number {
  if (!title.sides) return 0;
  const s1 = m.sides.find((s) => s.side === 1)?.players ?? [];
  const s2 = m.sides.find((s) => s.side === 2)?.players ?? [];
  const [left, right] = title.sides;
  const straight = sideScore(s1, left) + sideScore(s2, right);
  const swapped = sideScore(s1, right) + sideScore(s2, left);
  const sides = Math.max(straight, swapped) / 2;
  if (sides === 0) return 0;
  let score = 0.7 * sides;
  if (title.round && title.round === m.round) score += 0.15;
  if (ctx.tournamentMatched) score += 0.1;
  if (m.scheduledAt) {
    const hours = (ctx.videoTime.getTime() - m.scheduledAt.getTime()) / 3_600_000;
    // Uploads and streams land from shortly before the match to a day and a half after.
    if (hours > -2 && hours < 36) score += 0.1;
  }
  // Round so sums like 0.7 + 0.1 land exactly on the thresholds.
  return Math.min(1, Math.round(score * 100) / 100);
}

export type MatchVerdict = { matchId: number; score: number; status: "approved" | "pending" } | null;

// Picks the best candidate; a near-tie with the runner-up is left for review.
export function bestMatch(
  title: ParsedTitle,
  candidates: CandidateMatch[],
  ctx: {
    matchedTournaments: Set<number>;
    videoTime: Date;
  },
): MatchVerdict {
  const scored = candidates
    .map((m) => ({
      m,
      score: scoreMatch(title, m, {
        tournamentMatched: ctx.matchedTournaments.has(m.tournamentId),
        videoTime: ctx.videoTime,
      }),
    }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top) return null;
  const clear = !second || top.score - second.score >= 0.1;
  return {
    matchId: top.m.id,
    score: top.score,
    status: top.score >= AUTO_APPROVE && clear ? "approved" : "pending",
  };
}
