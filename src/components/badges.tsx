import type { MatchStatus } from "@/db/schema";
import { tierLabel } from "@/lib/tiers";
import type { TournamentStatus } from "@/lib/time";

export function LiveDot() {
  return <span className="inline-block size-2 animate-pulse rounded-full bg-live" aria-hidden />;
}

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-live/15 px-1.5 py-0.5 text-xs font-medium text-live">
        <LiveDot /> Live
      </span>
    );
  const label = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", postponed: "Postponed" }[
    status
  ];
  return <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{label}</span>;
}

export function MatchStatusLabel({ status }: { status: MatchStatus }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-live">
        <LiveDot /> LIVE
      </span>
    );
  if (status === "walkover") return <span className="text-xs text-muted">W/O</span>;
  if (status === "retired") return <span className="text-xs text-muted">Ret.</span>;
  if (status === "cancelled") return <span className="text-xs text-muted">Cancelled</span>;
  return null;
}

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
      {tierLabel(tier)}
    </span>
  );
}

export function Country({ code }: { code: string | null }) {
  if (!code) return null;
  return <span className="font-mono text-[11px] text-muted">{code}</span>;
}
