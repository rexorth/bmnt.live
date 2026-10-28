import { describe, expect, it } from "vitest";
import { orderBracket, type BracketMatch } from "@/lib/bracket";
import { parseDiscipline } from "@/lib/disciplines";
import { parseRound, roundIndex } from "@/lib/rounds";
import { parseDateQuery } from "@/lib/search-dates";
import { normalizeText, slugify } from "@/lib/text";
import { dateInZone, formatDateRange, parseIsoDuration, tournamentStatus } from "@/lib/time";
import { parseYouTubeUrl } from "@/lib/youtube-url";

describe("text", () => {
  it("strips accents and punctuation", () => {
    expect(normalizeText("Saarbrücken – HYLO Open!")).toBe("saarbrucken hylo open");
    expect(slugify("YONEX French Open 2026")).toBe("yonex-french-open-2026");
  });
});

describe("rounds and disciplines", () => {
  it.each([
    ["Round of 32", "R32"],
    ["R16", "R16"],
    ["Quarterfinals", "QF"],
    ["Quarter final", "QF"],
    ["Semi Final", "SF"],
    ["F", "F"],
    ["Final", "F"],
    ["Q-R2", "Q2"],
    ["Qualification", null],
  ])("parseRound(%s) = %s", (raw, want) => expect(parseRound(raw)).toBe(want));

  it("orders rounds first to last", () => {
    expect(["F", "R32", "QF", "SF", "R16"].sort((a, b) => roundIndex(a) - roundIndex(b))).toEqual([
      "R32",
      "R16",
      "QF",
      "SF",
      "F",
    ]);
  });

  it("reads discipline spellings", () => {
    expect(parseDiscipline("Men's Singles")).toBe("MS");
    expect(parseDiscipline("LS")).toBe("WS");
    expect(parseDiscipline("Mixed Doubles")).toBe("XD");
    expect(parseDiscipline("team")).toBeNull();
  });
});

describe("time", () => {
  const t = { startDate: "2026-10-27", endDate: "2026-11-01", timezone: "Europe/Berlin" };
  it("derives tournament status in the venue's zone", () => {
    // 23:30 UTC on 26 Oct is already 27 Oct in Berlin.
    expect(tournamentStatus(t, new Date("2026-10-26T23:30:00Z"))).toBe("live");
    expect(tournamentStatus(t, new Date("2026-10-26T21:00:00Z"))).toBe("upcoming");
    expect(tournamentStatus(t, new Date("2026-11-01T23:30:00Z"))).toBe("completed");
    expect(tournamentStatus({ ...t, statusOverride: "cancelled" }, new Date("2026-10-28T12:00:00Z"))).toBe("cancelled");
  });

  it("formats date ranges", () => {
    expect(formatDateRange("2026-10-27", "2026-11-01")).toBe("27 Oct – 1 Nov 2026");
    expect(formatDateRange("2026-10-20", "2026-10-25")).toBe("20 – 25 Oct 2026");
    expect(formatDateRange("2026-12-30", "2027-01-03")).toBe("30 Dec 2026 – 3 Jan 2027");
  });

  it("parses YouTube durations", () => {
    expect(parseIsoDuration("PT11H54M57S")).toBe(42897);
    expect(parseIsoDuration("PT57S")).toBe(57);
    expect(parseIsoDuration("P0D")).toBe(0);
  });

  it("gives calendar dates per zone", () => {
    expect(dateInZone(new Date("2026-10-27T23:00:00Z"), "Asia/Singapore")).toBe("2026-10-28");
  });
});

describe("search dates", () => {
  const ref = new Date(2026, 9, 28); // Wed 28 Oct 2026, local time
  it("reads a month and keeps the other words", () => {
    expect(parseDateQuery("axelsen march 2027", ref)).toEqual({
      range: { from: "2027-03-01", to: "2027-03-31" },
      rest: "axelsen",
    });
  });
  it("reads a bare year", () => {
    expect(parseDateQuery("all england 2027", ref)).toEqual({
      range: { from: "2027-01-01", to: "2027-12-31" },
      rest: "all england",
    });
  });
  it("widens 'next week' to Monday through Sunday", () => {
    expect(parseDateQuery("next week", ref).range).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
  it("reads an explicit range", () => {
    expect(parseDateQuery("27 Oct - 1 Nov 2026", ref).range).toEqual({ from: "2026-10-27", to: "2026-11-01" });
  });
  it("leaves plain names alone", () => {
    expect(parseDateQuery("an se young", ref)).toEqual({ range: null, rest: "an se young" });
  });
});

describe("YouTube links", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s", { id: "dQw4w9WgXcQ", startSec: 3723 }],
    ["https://youtu.be/dQw4w9WgXcQ?t=95", { id: "dQw4w9WgXcQ", startSec: 95 }],
    ["youtube.com/live/dQw4w9WgXcQ", { id: "dQw4w9WgXcQ", startSec: null }],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", { id: "dQw4w9WgXcQ", startSec: null }],
    ["dQw4w9WgXcQ", { id: "dQw4w9WgXcQ", startSec: null }],
  ])("parses %s", (url, want) => expect(parseYouTubeUrl(url)).toEqual(want));

  it("rejects other sites", () => {
    expect(parseYouTubeUrl("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeUrl("not a url")).toBeNull();
  });
});

describe("bracket order", () => {
  const m = (id: number, roundIndex: number, a: number[], b: number[], winnerSide: number | null): BracketMatch => ({
    id,
    roundIndex,
    bracketPosition: null,
    winnerSide,
    sides: [
      { side: 1, players: a.map((x) => ({ id: x })) },
      { side: 2, players: b.map((x) => ({ id: x })) },
    ],
  });

  it("rebuilds feeder order from who advanced", () => {
    // Semifinals arrive in the "wrong" order; the final names players 3 then 1.
    const sf1 = m(1, 5, [1], [2], 1);
    const sf2 = m(2, 5, [3], [4], 1);
    const final = m(3, 6, [3], [1], null);
    const cols = orderBracket([sf1, sf2, final]);
    expect(cols.map((c) => c.map((x) => x?.id ?? null))).toEqual([[2, 1], [3]]);
  });

  it("pads later rounds that haven't been drawn yet", () => {
    const qfs = [1, 2, 3, 4].map((i) => ({ ...m(i, 4, [i * 2], [i * 2 + 1], null), bracketPosition: i - 1 }));
    const cols = orderBracket(qfs);
    expect(cols.map((c) => c.length)).toEqual([4, 2, 1]);
    expect(cols[1].every((x) => x === null)).toBe(true);
  });
});
