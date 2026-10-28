import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Country, MatchStatusLabel } from "@/components/badges";
import { MatchList, sideLabel } from "@/components/match-row";
import { Section } from "@/components/section";
import { SuggestVideo } from "@/components/suggest-video";
import { Time } from "@/components/time";
import { VideoEmbed, VideoLink } from "@/components/video";
import { DISCIPLINE_LABELS, isDoubles } from "@/lib/disciplines";
import { roundLabel } from "@/lib/rounds";
import { formatDuration } from "@/lib/time";
import { getMatch } from "@/server/queries";

// Shared by metadata and the page so the match is read once per request.
const loadById = cache(async (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? getMatch(id) : null;
});
const load = async (params: Promise<{ id: string }>) => loadById((await params).id);

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
  const d = await load(params);
  if (!d) return {};
  const doubles = isDoubles(d.match.discipline);
  const [a, b] = [1, 2].map((s) =>
    sideLabel(
      d.match.sides.find((x) => x.side === s),
      doubles,
    ),
  );
  return { title: `${a} vs ${b} · ${d.match.round} · ${d.tournament.name}` };
}

export default async function MatchPage({ params }: PageProps<"/matches/[id]">) {
  const d = await load(params);
  if (!d) notFound();
  const { match: m, tournament: t } = d;
  const doubles = isDoubles(m.discipline);
  const primary = d.videos[0];

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted">
        <Link href={`/tournaments/${t.slug}`} className="text-accent hover:underline">
          {t.name}
        </Link>
        {" · "}
        {DISCIPLINE_LABELS[m.discipline]}
        {m.drawType === "qualifying" ? " qualifying" : ""} · {roundLabel(m.round)}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <MatchStatusLabel status={m.status} />
          {m.scheduledAt ? (
            <span>
              {m.status === "scheduled" ? "Scheduled " : ""}
              <Time at={m.scheduledAt} tz={t.timezone} style="datetime" zone />
            </span>
          ) : null}
          {m.court ? <span>{m.court}</span> : null}
          {m.durationMin ? <span>{formatDuration(m.durationMin)}</span> : null}
        </div>
        <div className="space-y-3">
          {([1, 2] as const).map((side) => {
            const s = m.sides.find((x) => x.side === side);
            const won = m.winnerSide === side;
            return (
              <div key={side} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  {s?.players.length ? (
                    s.players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Link
                          href={`/players/${p.slug}`}
                          className={`truncate text-lg hover:underline ${won ? "font-semibold" : m.winnerSide ? "text-muted" : ""}`}
                        >
                          {p.name}
                        </Link>
                        <Country code={p.country} />
                      </div>
                    ))
                  ) : (
                    <span className="text-lg text-muted">TBD</span>
                  )}
                  {s?.seed ? <span className="text-xs text-muted">Seed {s.seed}</span> : null}
                </div>
                <div className="flex gap-3 font-mono text-2xl tabular-nums">
                  {m.games.map((g, i) => {
                    const mine = side === 1 ? g.a : g.b;
                    const theirs = side === 1 ? g.b : g.a;
                    return (
                      <span key={i} className={mine > theirs ? "font-semibold" : "text-muted"}>
                        {mine}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title="Watch">
            {primary ? (
              <div className="space-y-3">
                <VideoEmbed
                  youtubeId={primary.youtubeId}
                  start={primary.offsetSec}
                  title={primary.title ?? `${sideLabel(m.sides[0], doubles)} vs ${sideLabel(m.sides[1], doubles)}`}
                />
                {d.videos.slice(1).map((v) => (
                  <VideoLink key={v.linkId} v={v} start={v.offsetSec} />
                ))}
              </div>
            ) : null}
            {d.courtStreams.length ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  {primary ? "Also on the" : "Shown on the"} {m.court} stream. The link opens near the match&apos;s
                  start.
                </p>
                {d.courtStreams.map((v) => (
                  <VideoLink key={v.linkId} v={v} start={v.suggestedOffset} label={`Court ${v.court} stream`} />
                ))}
              </div>
            ) : null}
            {!primary && !d.courtStreams.length ? (
              <p className="text-sm text-muted">No video of this match has been found yet.</p>
            ) : null}
          </Section>
          {d.headToHead.length ? (
            <Section title="Previous meetings">
              <MatchList matches={d.headToHead} showTournament />
            </Section>
          ) : null}
        </div>
        <aside>
          <SuggestVideo matchId={m.id} />
        </aside>
      </div>
    </div>
  );
}
