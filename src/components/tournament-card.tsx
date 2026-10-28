import Link from "next/link";
import { formatDateRange } from "@/lib/time";
import type { TournamentRow } from "@/server/queries";
import { TierBadge, TournamentStatusBadge } from "./badges";

export function TournamentCard({ t }: { t: TournamentRow }) {
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="block rounded-lg border border-line bg-surface p-3 hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{t.name}</h3>
        <TournamentStatusBadge status={t.status} />
      </div>
      <div className="mt-1 text-sm text-muted">
        {formatDateRange(t.startDate, t.endDate)}
        {t.city ? ` · ${t.city}` : ""}
        {t.country ? `, ${t.country}` : ""}
      </div>
      <div className="mt-2">
        <TierBadge tier={t.tier} />
      </div>
    </Link>
  );
}

export function TournamentTable({ list }: { list: TournamentRow[] }) {
  if (!list.length) return <p className="py-6 text-center text-sm text-muted">No tournaments match.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {list.map((t) => (
        <Link
          key={t.id}
          href={`/tournaments/${t.slug}`}
          className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 text-sm last:border-b-0 hover:bg-surface-2 max-sm:grid-cols-[1fr_auto]"
        >
          <span className="text-muted max-sm:hidden">{formatDateRange(t.startDate, t.endDate)}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.name}</span>
            <span className="block truncate text-xs text-muted">
              <span className="sm:hidden">{formatDateRange(t.startDate, t.endDate)} · </span>
              {[t.city, t.country].filter(Boolean).join(", ")}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <TournamentStatusBadge status={t.status} />
            <TierBadge tier={t.tier} />
          </span>
        </Link>
      ))}
    </div>
  );
}
