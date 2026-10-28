/**
 * Maps BWF "day-matches" records onto NMatch.
 *
 * UNVERIFIED: the only things publicly documented about this endpoint are its URL,
 * its query parameters and the matchTime / matchTimeUtc fields. Every other field
 * name below is a candidate, tried in order, until a real response has been captured
 * (`pnpm ingest capture`) and these lists can be trimmed to what BWF actually sends.
 * Records that can't be mapped are reported, never guessed at.
 */
import type { GameScore, MatchStatus } from "@/db/schema";
import { parseDiscipline } from "@/lib/disciplines";
import { isQualifyingRound, parseRound } from "@/lib/rounds";
import type { NMatch, NPlayer, NSide } from "../../types";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function get(obj: Rec, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!isRec(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function pick(obj: Rec, paths: string[]): unknown {
  for (const p of paths) {
    const v = get(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

// Find every object in the payload that looks like a match.
export function extractMatchRecords(payload: unknown): Rec[] {
  const out: Rec[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isRec(v)) {
      if ("matchTimeUtc" in v || "matchTime" in v) out.push(v);
      else Object.values(v).forEach(walk);
    }
  };
  walk(payload);
  return out;
}

function mapPlayer(p: Rec): NPlayer | null {
  const name =
    str(pick(p, ["nameDisplay", "name", "fullName", "displayName"])) ??
    [str(pick(p, ["firstName", "givenName"])), str(pick(p, ["lastName", "familyName"]))].filter(Boolean).join(" ");
  const id = str(pick(p, ["id", "playerId", "memberId", "code"]));
  if (!name || !id) return null;
  const gender = str(pick(p, ["gender", "genderId"]))?.toUpperCase();
  return {
    externalId: id,
    name,
    lastName: str(pick(p, ["lastName", "familyName", "surname"])) ?? null,
    country: str(pick(p, ["countryCode", "nationality", "country.code", "country", "countryFlag"])) ?? null,
    gender: gender === "M" || gender === "F" ? gender : null,
    photoUrl: str(pick(p, ["avatar", "photo", "imageUrl", "image"])) ?? null,
  };
}

function mapSide(rec: Rec, side: 1 | 2): NSide | null {
  const team = pick(rec, [`team${side}`, side === 1 ? "home" : "away", side === 1 ? "teamA" : "teamB"]);
  const list: unknown[] = [];
  if (isRec(team)) {
    const ps = pick(team, ["players", "members"]);
    if (Array.isArray(ps)) list.push(...ps);
    else list.push(team.player1, team.player2);
  } else if (Array.isArray(team)) list.push(...team);
  const players = list
    .filter(isRec)
    .map(mapPlayer)
    .filter((p): p is NPlayer => p !== null);
  if (!players.length) return null;
  const seed = str(
    pick(rec, [`team${side}seed`, `team${side}Seed`]) ?? (isRec(team) ? pick(team, ["seed", "seeding"]) : undefined),
  );
  return { side, players, seed: seed ?? null };
}

export function parseScore(raw: unknown): GameScore[] {
  if (typeof raw === "string") {
    return [...raw.matchAll(/(\d+)\s*-\s*(\d+)/g)].map((m) => ({ a: Number(m[1]), b: Number(m[2]) }));
  }
  if (!Array.isArray(raw)) return [];
  const games: GameScore[] = [];
  for (const g of raw) {
    if (!isRec(g)) continue;
    const a = num(pick(g, ["home", "team1", "t1", "score1", "a"]));
    const b = num(pick(g, ["away", "team2", "t2", "score2", "b"]));
    if (a !== undefined && b !== undefined && (a > 0 || b > 0)) games.push({ a, b });
  }
  return games;
}

function mapStatus(raw: string | undefined, games: GameScore[], winner: number | undefined): MatchStatus {
  const s = raw?.toLowerCase() ?? "";
  if (/walk ?over|^w$|w\/o/.test(s)) return "walkover";
  if (/retire|^r$/.test(s)) return "retired";
  if (/cancel/.test(s)) return "cancelled";
  if (/finish|complete|ended|^f$/.test(s) || winner === 1 || winner === 2) return "completed";
  if (/live|play|progress|^p$|on ?court/.test(s) || games.length) return "live";
  return "scheduled";
}

export type MapResult = { matches: NMatch[]; unmapped: { record: Rec; reason: string }[] };

export function mapDayMatches(payload: unknown, tournamentCode: string): MapResult {
  const result: MapResult = { matches: [], unmapped: [] };
  for (const rec of extractMatchRecords(payload)) {
    const fail = (reason: string) => result.unmapped.push({ record: rec, reason });
    const id = str(pick(rec, ["id", "matchId", "code", "matchCode"]));
    if (!id) {
      fail("no match id");
      continue;
    }
    const drawName = str(pick(rec, ["drawName", "draw.name", "draw"])) ?? "";
    const discipline = parseDiscipline(
      str(pick(rec, ["eventName", "event", "matchTypeValue", "matchType", "eventCode", "discipline"])) ??
        drawName.split(/[\s-]/)[0],
    );
    if (!discipline) {
      fail("no discipline");
      continue;
    }
    const round = parseRound(str(pick(rec, ["roundName", "round", "roundCode", "round.name"])));
    if (!round) {
      fail("no round");
      continue;
    }
    const s1 = mapSide(rec, 1);
    const s2 = mapSide(rec, 2);
    const games = parseScore(pick(rec, ["score", "scores", "sets", "scoreStatus"]));
    const winner = num(pick(rec, ["winner", "winnerTeam", "winnerSide"]));
    const utc = str(pick(rec, ["matchTimeUtc"]));
    const scheduledAt = utc ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(utc) ? utc : `${utc.replace(" ", "T")}Z`) : null;
    result.matches.push({
      externalId: id,
      tournamentExternalId: tournamentCode,
      discipline,
      drawType: isQualifyingRound(round) || /qualif/i.test(drawName) ? "qualifying" : "main",
      round,
      court: str(pick(rec, ["courtName", "court.name", "court", "courtCode"])) ?? null,
      scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null,
      status: mapStatus(str(pick(rec, ["matchStatusValue", "matchStatus", "status"])), games, winner),
      winnerSide: winner === 1 || winner === 2 ? winner : null,
      games,
      durationMin: num(pick(rec, ["duration", "durationMinutes", "matchDuration"])) ?? null,
      // A side with no players yet (TBD) is left out; the bracket shows it as open.
      sides: [s1, s2].filter((s): s is NSide => s !== null),
    });
  }
  return result;
}
