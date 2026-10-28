export type TournamentStatus = "upcoming" | "live" | "completed" | "cancelled" | "postponed";

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();

// Calendar date (YYYY-MM-DD) of an instant in the given IANA zone.
export function dateInZone(instant: Date, timeZone: string): string {
  let fmt = ymdFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormatters.set(timeZone, fmt);
  }
  return fmt.format(instant);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

export function tournamentStatus(
  t: { startDate: string; endDate: string; timezone: string; statusOverride?: string | null },
  now: Date,
): TournamentStatus {
  if (t.statusOverride === "cancelled" || t.statusOverride === "postponed") return t.statusOverride;
  const today = dateInZone(now, t.timezone);
  if (today < t.startDate) return "upcoming";
  if (today > t.endDate) return "completed";
  return "live";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "27 Oct – 1 Nov 2026", "3 – 8 Mar 2027"; dates are calendar dates, so no zone math.
export function formatDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const mon = (m: number) => MONTHS.at(m - 1);
  if (sy !== ey) return `${sd} ${mon(sm)} ${sy} – ${ed} ${mon(em)} ${ey}`;
  if (sm !== em) return `${sd} ${mon(sm)} – ${ed} ${mon(em)} ${ey}`;
  if (sd === ed) return `${sd} ${mon(sm)} ${sy}`;
  return `${sd} – ${ed} ${mon(sm)} ${sy}`;
}

export function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// "1h 05m" style offsets for video deep links.
export function formatOffset(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// ISO 8601 durations from the YouTube API (PT1H22M25S, P0D).
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((v) => (v ? Number(v) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}
