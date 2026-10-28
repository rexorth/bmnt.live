import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { videoKind } from "@/ingest/jobs/youtube";
import {
  AUTO_APPROVE,
  bestMatch,
  courtKey,
  parseVideoTitle,
  scoreMatch,
  tournamentNameScore,
  type CandidateMatch,
} from "@/ingest/match-videos";
import { parseVideosResponse } from "@/ingest/sources/youtube/client";

// Real videos.list response for BWF TV uploads, captured 2026-10-28.
const fixture = parseVideosResponse(
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures/youtube/bwftv-videos.json"), "utf8")),
);
const byTitle = (t: string) => {
  const v = fixture.find((x) => x.snippet.title === t);
  if (!v) throw new Error(`fixture missing "${t}"`);
  return v;
};

describe("parseVideoTitle on real BWF TV titles", () => {
  it("reads a full-match upload", () => {
    expect(parseVideoTitle("YONEX French Open 2026 | An Se Young (KOR) [1] vs Pusarla V. Sindhu (IND) | F")).toEqual({
      tournament: { name: "YONEX French Open 2026", year: 2026 },
      court: null,
      day: null,
      round: "F",
      sides: ["An Se Young", "Pusarla V. Sindhu"],
    });
  });

  it("reads doubles pairs and seeds", () => {
    const p = parseVideoTitle(
      "YONEX French Open 2026 | Fukushima/Matsumoto (JPN) [1] vs Tan/Muralitharan (MAS) [2] | F",
    );
    expect(p.sides).toEqual(["Fukushima/Matsumoto", "Tan/Muralitharan"]);
  });

  it("reads an all-day court stream", () => {
    expect(parseVideoTitle("HYLO Open 2026 | Day 1 | Court 2 | Qualification/Round of 32")).toEqual({
      tournament: { name: "HYLO Open 2026", year: 2026 },
      court: "2",
      day: 1,
      round: "R32",
      sides: null,
    });
  });

  it("reads highlights without a tournament", () => {
    const p = parseVideoTitle("Goh/Izzuddin vs Man/Tee | Malaysian pairs go for gold");
    expect(p.sides).toEqual(["Goh/Izzuddin", "Man/Tee"]);
    expect(p.tournament).toBeNull();
  });

  it("parses every fixture title without throwing", () => {
    for (const v of fixture) expect(() => parseVideoTitle(v.snippet.title)).not.toThrow();
    const courts = fixture.filter((v) => parseVideoTitle(v.snippet.title).court);
    expect(courts.length).toBeGreaterThanOrEqual(6);
  });
});

describe("classification of real uploads", () => {
  it("tells streams, full matches, highlights and upcoming apart", () => {
    expect(videoKind(byTitle("HYLO Open 2026 | Day 1 | Court 1 | Qualification/Round of 32"))).toBe("vod");
    expect(videoKind(byTitle("HYLO Open 2026 | Day 2 | Court 3 | Round of 32"))).toBe("upcoming");
    expect(videoKind(byTitle("Goh/Izzuddin vs Man/Tee | Malaysian pairs go for gold"))).toBe("highlight");
  });
});

describe("matching", () => {
  it("compares tournament names regardless of year and sponsor order", () => {
    expect(tournamentNameScore("YONEX French Open 2026", "YONEX French Open 2026")).toBe(1);
    expect(tournamentNameScore("French Open 2026", "YONEX French Open 2026")).toBe(1);
    expect(tournamentNameScore("HYLO Open 2026", "YONEX French Open 2026")).toBeLessThan(0.75);
  });

  it("normalises court names", () => {
    expect(courtKey("Court 1")).toBe("1");
    expect(courtKey("C02")).toBe("2");
    expect(courtKey(null)).toBeNull();
  });

  // Candidate rows use BWF-style names (family name first, in capitals) as test input.
  const final: CandidateMatch = {
    id: 10,
    tournamentId: 1,
    round: "F",
    scheduledAt: new Date("2026-10-25T10:00:00Z"),
    sides: [
      { side: 1, players: [{ name: "AN Se Young", lastName: "AN" }] },
      { side: 2, players: [{ name: "PUSARLA V. Sindhu", lastName: "PUSARLA" }] },
    ],
  };
  const otherSemi: CandidateMatch = {
    id: 11,
    tournamentId: 1,
    round: "SF",
    scheduledAt: new Date("2026-10-24T07:30:00Z"),
    sides: [
      { side: 1, players: [{ name: "AN Se Young", lastName: "AN" }] },
      { side: 2, players: [{ name: "OKUHARA Nozomi", lastName: "OKUHARA" }] },
    ],
  };

  it("auto-approves a full-match upload", () => {
    const v = byTitle("YONEX French Open 2026 | An Se Young (KOR) [1] vs Pusarla V. Sindhu (IND) | F");
    const title = parseVideoTitle(v.snippet.title);
    const at = new Date(v.liveStreamingDetails!.actualStartTime!);
    expect(scoreMatch(title, final, { tournamentMatched: true, videoTime: at })).toBe(1);
    const verdict = bestMatch(title, [otherSemi, final], { matchedTournaments: new Set([1]), videoTime: at });
    expect(verdict).toEqual({ matchId: 10, score: 1, status: "approved" });
  });

  it("matches highlights by players and timing", () => {
    const v = byTitle("An Se Young vs Pusarla V. Sindhu | Hard-fought rallies with relentless retrieval");
    const verdict = bestMatch(parseVideoTitle(v.snippet.title), [otherSemi, final], {
      matchedTournaments: new Set(),
      videoTime: new Date(v.snippet.publishedAt),
    });
    expect(verdict?.matchId).toBe(10);
    expect(verdict!.score).toBeGreaterThanOrEqual(AUTO_APPROVE);
  });

  it("matches doubles by family names in either order", () => {
    const md: CandidateMatch = {
      id: 12,
      tournamentId: 1,
      round: "F",
      scheduledAt: new Date("2026-10-25T15:00:00Z"),
      sides: [
        {
          side: 1,
          players: [
            { name: "MAN Wei Chong", lastName: "MAN" },
            { name: "TEE Kai Wun", lastName: "TEE" },
          ],
        },
        {
          side: 2,
          players: [
            { name: "GOH Sze Fei", lastName: "GOH" },
            { name: "Nur IZZUDDIN", lastName: "IZZUDDIN" },
          ],
        },
      ],
    };
    const title = parseVideoTitle("YONEX French Open 2026 | Goh/Izzuddin (MAS) [6] vs Man/Tee (MAS) | F");
    expect(scoreMatch(title, md, { tournamentMatched: true, videoTime: new Date("2026-10-25T15:00:00Z") })).toBe(1);
  });

  it("leaves a weak match for review", () => {
    const title = parseVideoTitle("An Se Young vs Someone Else | Quick rally");
    const verdict = bestMatch(title, [final], {
      matchedTournaments: new Set(),
      videoTime: new Date("2026-12-01T00:00:00Z"),
    });
    expect(verdict).toBeNull();
  });
});
