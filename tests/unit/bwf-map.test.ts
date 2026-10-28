import { describe, expect, it } from "vitest";
import { extractMatchRecords, mapDayMatches, parseScore } from "@/ingest/sources/bwf/map";

// HAND-WRITTEN, NOT A CAPTURED RESPONSE. Only matchTime / matchTimeUtc are publicly
// documented for this endpoint; the other field names are guesses the mapper tries.
// Replace with a real capture (`pnpm ingest capture <code> <date>`) once BWF is reachable.
const assumed = {
  results: [
    {
      id: 123,
      eventName: "MS",
      roundName: "Round of 32",
      courtName: "Court 2",
      matchTime: "2026-10-28 10:00:00",
      matchTimeUtc: "2026-10-28 09:00:00",
      matchStatus: "F",
      winner: 1,
      duration: 48,
      score: [
        { set: 1, home: 21, away: 15 },
        { set: 2, home: 19, away: 21 },
        { set: 3, home: 21, away: 17 },
      ],
      team1: { seed: "3", players: [{ id: 1, nameDisplay: "Player One", countryCode: "DEN" }] },
      team2: { players: [{ id: 2, nameDisplay: "Player Two", countryCode: "JPN" }] },
    },
    { id: 124, matchTimeUtc: "2026-10-28 10:00:00", roundName: "R32" },
  ],
};

describe("BWF day-matches mapper (assumed shape)", () => {
  it("finds match-like records anywhere in the payload", () => {
    expect(extractMatchRecords(assumed)).toHaveLength(2);
  });

  it("maps what it can and reports what it can't", () => {
    const { matches, unmapped } = mapDayMatches(assumed, "CODE");
    expect(unmapped).toEqual([{ record: assumed.results[1], reason: "no discipline" }]);
    expect(matches[0]).toMatchObject({
      externalId: "123",
      tournamentExternalId: "CODE",
      discipline: "MS",
      drawType: "main",
      round: "R32",
      court: "Court 2",
      scheduledAt: new Date("2026-10-28T09:00:00Z"),
      status: "completed",
      winnerSide: 1,
      durationMin: 48,
      games: [
        { a: 21, b: 15 },
        { a: 19, b: 21 },
        { a: 21, b: 17 },
      ],
    });
    expect(matches[0].sides[0]).toMatchObject({
      side: 1,
      seed: "3",
      players: [{ externalId: "1", name: "Player One", country: "DEN" }],
    });
  });

  it("reads scores written as text", () => {
    expect(parseScore("21-15 19-21 21-17")).toEqual([
      { a: 21, b: 15 },
      { a: 19, b: 21 },
      { a: 21, b: 17 },
    ]);
  });
});
