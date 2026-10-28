import Link from "next/link";
import { orderBracket } from "@/lib/bracket";
import { isDoubles } from "@/lib/disciplines";
import { roundLabel } from "@/lib/rounds";
import type { MatchCard } from "@/server/queries";
import { LiveDot } from "./badges";
import { sideLabel } from "./match-row";

// Grid geometry: the first round gets two units per match; each later round doubles.
const UNIT = 36;
const CARD_H = 60;
const CARD_W = 216;
const GAP = 36;

function BracketCard({ m }: { m: MatchCard | null }) {
  if (!m) {
    return (
      <div className="flex h-full items-center rounded-md border border-dashed border-line px-2 text-xs text-muted">
        TBD
      </div>
    );
  }
  const doubles = isDoubles(m.discipline);
  return (
    <Link
      href={`/matches/${m.id}`}
      className={`block h-full rounded-md border bg-surface px-2 py-1 text-[13px] hover:border-accent ${m.status === "live" ? "border-live" : "border-line"}`}
    >
      {([1, 2] as const).map((side) => {
        const s = m.sides.find((x) => x.side === side);
        const won = m.winnerSide === side;
        return (
          <div key={side} className="flex h-[25px] items-center justify-between gap-2">
            <span className={`truncate ${won ? "font-semibold" : m.winnerSide ? "text-muted" : ""}`}>
              {s?.seed ? <span className="mr-1 text-[10px] text-muted">{s.seed}</span> : null}
              {sideLabel(s, doubles)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
              {side === 1 && m.status === "live" ? <LiveDot /> : null}
              {m.games.map((g, i) => {
                const mine = side === 1 ? g.a : g.b;
                const theirs = side === 1 ? g.b : g.a;
                return (
                  <span key={i} className={mine > theirs ? "font-semibold" : "text-muted"}>
                    {mine}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </Link>
  );
}

export function Bracket({ matches }: { matches: MatchCard[] }) {
  const columns = orderBracket(matches);
  if (!columns.length) return null;
  const firstCount = columns[0].length;
  const height = firstCount * 2 * UNIT;
  return (
    <div className="snap-x overflow-x-auto pb-2">
      <div className="flex" style={{ gap: GAP, minWidth: columns.length * (CARD_W + GAP) }}>
        {columns.map((col, r) => {
          const span = 2 ** (r + 1) * UNIT;
          const round = col.find(Boolean)?.round;
          return (
            <div key={r} className="shrink-0 snap-start" style={{ width: CARD_W }}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {round ? roundLabel(round) : r === columns.length - 1 ? "Final" : " "}
              </div>
              <div className="relative" style={{ height }}>
                {col.map((m, i) => {
                  const top = i * span + (span - CARD_H) / 2;
                  const last = r === columns.length - 1;
                  return (
                    <div key={m?.id ?? `tbd-${i}`} className="absolute inset-x-0" style={{ top, height: CARD_H }}>
                      <BracketCard m={m} />
                      {!last ? (
                        <>
                          {/* Stub out to the right, then a vertical run to the pair's midpoint. */}
                          <span className="absolute top-1/2 h-px bg-line" style={{ left: CARD_W, width: GAP / 2 }} />
                          <span
                            className="absolute w-px bg-line"
                            style={{
                              left: CARD_W + GAP / 2,
                              top: i % 2 === 0 ? CARD_H / 2 : CARD_H / 2 - span / 2,
                              height: span / 2,
                            }}
                          />
                        </>
                      ) : null}
                      {r > 0 ? (
                        <span className="absolute top-1/2 h-px bg-line" style={{ left: -GAP / 2, width: GAP / 2 }} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
