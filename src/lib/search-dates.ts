import * as chrono from "chrono-node";
import { addDays } from "./time";

export type DateRange = { from: string; to: string };

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function lastDayOfMonth(year: number, month: number): string {
  return ymd(new Date(year, month, 0));
}

/**
 * Pulls a date or date range out of a free-text search ("axelsen march 2027",
 * "all england 2027", "next week") and returns it with the remaining words.
 */
export function parseDateQuery(query: string, ref: Date): { range: DateRange | null; rest: string } {
  const results = chrono.en.parse(query, ref, { forwardDate: true });
  const hit = results[0];
  if (hit) {
    const rest = (query.slice(0, hit.index) + " " + query.slice(hit.index + hit.text.length))
      .replace(/\s+/g, " ")
      .trim();
    const start = hit.start;
    const startDate = start.date();
    let range: DateRange;
    if (hit.end) {
      range = { from: ymd(startDate), to: ymd(hit.end.date()) };
    } else if (!start.isCertain("day") && start.isCertain("month")) {
      const y = start.get("year") ?? startDate.getFullYear();
      const m = start.get("month") ?? startDate.getMonth() + 1;
      range = { from: `${y}-${String(m).padStart(2, "0")}-01`, to: lastDayOfMonth(y, m) };
    } else if (/\bweek\b/i.test(hit.text)) {
      // chrono resolves "next week" to a single day; widen it to that week (Mon–Sun).
      const dow = (startDate.getDay() + 6) % 7;
      const monday = addDays(ymd(startDate), -dow);
      range = { from: monday, to: addDays(monday, 6) };
    } else {
      range = { from: ymd(startDate), to: ymd(startDate) };
    }
    return { range, rest };
  }

  // chrono ignores a bare year; treat one as the whole year.
  const year = query.match(/\b(20\d{2})\b/);
  if (year) {
    const rest = query.replace(year[0], " ").replace(/\s+/g, " ").trim();
    return { range: { from: `${year[1]}-01-01`, to: `${year[1]}-12-31` }, rest };
  }
  return { range: null, rest: query.trim() };
}
