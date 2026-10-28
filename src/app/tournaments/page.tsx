import type { Metadata } from "next";
import { io } from "next/cache";
import { TournamentTable } from "@/components/tournament-card";
import { parseDateQuery } from "@/lib/search-dates";
import { TIERS, isTier } from "@/lib/tiers";
import type { TournamentStatus } from "@/lib/time";
import { listTournaments } from "@/server/queries";

export const metadata: Metadata = { title: "Tournaments" };

const STATUSES: { key: TournamentStatus; label: string }[] = [
  { key: "live", label: "In progress" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TournamentsPage({ searchParams }: PageProps<"/tournaments">) {
  const sp = await searchParams;
  const when = first(sp.when).trim();
  const tier = first(sp.tier);
  const status = first(sp.status) as TournamentStatus | "";
  const q = first(sp.q).trim();
  // "next week" depends on today, so resolve it at request time.
  await io();
  const range = when ? parseDateQuery(when, new Date()).range : null;
  const list = await listTournaments({
    range,
    tier: isTier(tier) ? tier : undefined,
    status: STATUSES.some((s) => s.key === status) ? (status as TournamentStatus) : undefined,
    q: q || undefined,
  });

  const field = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tournaments</h1>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="grid gap-1 text-xs text-muted">
          Name
          <input name="q" defaultValue={q} placeholder="e.g. French Open" className={field} />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          When
          <input name="when" defaultValue={when} placeholder="e.g. March 2027, next week" className={field} />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Level
          <select name="tier" defaultValue={tier} className={field}>
            <option value="">All levels</option>
            {TIERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Status
          <select name="status" defaultValue={status} className={field}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">Filter</button>
      </form>
      {range ? (
        <p className="text-sm text-muted">
          Showing tournaments overlapping {range.from} to {range.to}.
        </p>
      ) : null}
      <TournamentTable list={list} />
    </div>
  );
}
