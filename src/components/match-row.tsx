import Link from "next/link";
import { isDoubles } from "@/lib/disciplines";
import type { MatchCard, SideCard } from "@/server/queries";
import { Country, MatchStatusLabel } from "./badges";
import { Time } from "./time";

export function sideLabel(side: SideCard | undefined, doubles: boolean): string {
  if (!side?.players.length) return "TBD";
  if (!doubles) return side.players[0].name;
  return side.players.map((p) => p.lastName ?? p.name).join(" / ");
}

function SideLine({ m, side }: { m: MatchCard; side: 1 | 2 }) {
  const s = m.sides.find((x) => x.side === side);
  const won = m.winnerSide === side;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`truncate ${won ? "font-semibold text-ink" : m.winnerSide ? "text-muted" : "text-ink"}`}>
        {sideLabel(s, isDoubles(m.discipline))}
      </span>
      {s?.seed ? <span className="text-[11px] text-muted">[{s.seed}]</span> : null}
      <Country code={s?.players[0]?.country ?? null} />
    </div>
  );
}

export function Games({ m, side }: { m: MatchCard; side: 1 | 2 }) {
  return (
    <div className="flex gap-2 font-mono text-sm tabular-nums">
      {m.games.map((g, i) => {
        const mine = side === 1 ? g.a : g.b;
        const theirs = side === 1 ? g.b : g.a;
        return (
          <span key={i} className={`w-5 text-right ${mine > theirs ? "font-semibold text-ink" : "text-muted"}`}>
            {mine}
          </span>
        );
      })}
    </div>
  );
}

// One line per match in schedules and result lists.
export function MatchRow({ m, showTournament = false }: { m: MatchCard; showTournament?: boolean }) {
  const at = m.startedAt ?? m.scheduledAt;
  return (
    <Link
      href={`/matches/${m.id}`}
      className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2"
    >
      <div className="text-xs text-muted">
        {m.status === "live" ? (
          <MatchStatusLabel status="live" />
        ) : at ? (
          <Time at={at} tz={m.tournament.timezone} />
        ) : (
          "—"
        )}
        <div className="mt-0.5">
          {m.discipline} {m.round}
        </div>
      </div>
      <div className="min-w-0 text-sm">
        {showTournament ? <div className="truncate text-[11px] text-muted">{m.tournament.name}</div> : null}
        <SideLine m={m} side={1} />
        <SideLine m={m} side={2} />
      </div>
      <div className="flex items-center gap-3">
        {m.videoCount ? (
          <span
            className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent"
            title="Video available"
          >
            ▶ Video
          </span>
        ) : null}
        {m.status !== "live" && m.status !== "completed" ? <MatchStatusLabel status={m.status} /> : null}
        {m.games.length ? (
          <div className="space-y-0.5">
            <Games m={m} side={1} />
            <Games m={m} side={2} />
          </div>
        ) : m.court ? (
          <span className="text-xs text-muted">{m.court}</span>
        ) : null}
      </div>
    </Link>
  );
}

export function MatchList({
  matches,
  showTournament,
  empty,
}: {
  matches: MatchCard[];
  showTournament?: boolean;
  empty?: string;
}) {
  if (!matches.length) return <p className="px-3 py-6 text-center text-sm text-muted">{empty ?? "No matches."}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {matches.map((m) => (
        <MatchRow key={m.id} m={m} showTournament={showTournament} />
      ))}
    </div>
  );
}
