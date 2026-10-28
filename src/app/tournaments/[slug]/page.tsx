import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TierBadge, TournamentStatusBadge } from "@/components/badges";
import { Bracket } from "@/components/bracket";
import { MatchList } from "@/components/match-row";
import { Section } from "@/components/section";
import { VideoLink } from "@/components/video";
import type { Discipline } from "@/db/schema";
import { DISCIPLINE_LABELS, DISCIPLINES } from "@/lib/disciplines";
import { roundLabel } from "@/lib/rounds";
import { dateInZone, daysBetween, formatDateRange, formatDay } from "@/lib/time";
import {
  getTournament,
  getTournamentMatches,
  getTournamentVideos,
  type MatchCard,
  type VideoCard,
} from "@/server/queries";

const TABS = ["overview", "schedule", "draws", "results", "watch"] as const;
type Tab = (typeof TABS)[number];

// Shared by metadata and the page so the tournament is read once per request.
const loadTournament = cache(getTournament);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params }: PageProps<"/tournaments/[slug]">): Promise<Metadata> {
  const t = await loadTournament((await params).slug);
  return t ? { title: t.name, description: `${t.name}: draws, schedule, results and streams.` } : {};
}

export default async function TournamentPage({ params, searchParams }: PageProps<"/tournaments/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const t = await loadTournament(slug);
  if (!t) notFound();
  const [matches, videos] = await Promise.all([getTournamentMatches(t.id), getTournamentVideos(t.id)]);

  const requested = first(sp.tab) as Tab;
  const tab: Tab = TABS.includes(requested) ? requested : matches.length || !videos.length ? "overview" : "watch";
  const href = (next: Record<string, string>) => `/tournaments/${t.slug}?${new URLSearchParams({ tab, ...next })}`;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={t.tier} />
          <TournamentStatusBadge status={t.status} />
        </div>
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="text-sm text-muted">
          {formatDateRange(t.startDate, t.endDate)}
          {[t.venue, t.city, t.country].filter(Boolean).length
            ? ` · ${[t.venue, t.city, t.country].filter(Boolean).join(", ")}`
            : ""}
          {` · venue time ${t.timezone}`}
          {t.websiteUrl ? (
            <>
              {" · "}
              <a href={t.websiteUrl} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
                Official site
              </a>
            </>
          ) : null}
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map((name) => (
          <Link
            key={name}
            href={`/tournaments/${t.slug}?tab=${name}`}
            className={`-mb-px border-b-2 px-3 py-2 capitalize ${tab === name ? "border-accent font-medium" : "border-transparent text-muted hover:text-ink"}`}
          >
            {name}
            {name === "watch" && videos.length ? (
              <span className="ml-1 text-xs text-muted">{videos.length}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {!matches.length && tab !== "watch" ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Draws and the schedule for this tournament haven&apos;t been loaded yet.
          {videos.length ? (
            <>
              {" "}
              <Link href={`/tournaments/${t.slug}?tab=watch`} className="text-accent hover:underline">
                {videos.length} videos and streams
              </Link>{" "}
              are already linked.
            </>
          ) : null}
        </p>
      ) : null}

      {tab === "overview" && matches.length ? <Overview matches={matches} videos={videos} slug={t.slug} /> : null}
      {tab === "schedule" && matches.length ? (
        <Schedule matches={matches} t={t} day={first(sp.day)} href={href} />
      ) : null}
      {tab === "draws" && matches.length ? <Draws matches={matches} event={first(sp.event)} href={href} /> : null}
      {tab === "results" && matches.length ? <Results matches={matches} /> : null}
      {tab === "watch" ? <Watch videos={videos} t={t} /> : null}
    </div>
  );
}

function Overview({ matches, videos, slug }: { matches: MatchCard[]; videos: VideoCard[]; slug: string }) {
  const live = matches.filter((m) => m.status === "live");
  const next = matches.filter((m) => m.status === "scheduled" && m.sides.length === 2).slice(0, 10);
  const done = matches
    .filter((m) => m.winnerSide)
    .reverse()
    .slice(0, 10);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        {live.length ? (
          <Section title="Live now">
            <MatchList matches={live} />
          </Section>
        ) : null}
        <Section title="Up next" href={`/tournaments/${slug}?tab=schedule`}>
          <MatchList matches={next} empty="No more matches scheduled." />
        </Section>
        <Section title="Latest results" href={`/tournaments/${slug}?tab=results`}>
          <MatchList matches={done} empty="No results yet." />
        </Section>
      </div>
      <aside>
        <Section title="Watch" href={`/tournaments/${slug}?tab=watch`}>
          <div className="space-y-2">
            {videos.length ? (
              videos
                .slice(0, 4)
                .map((v) => <VideoLink key={v.linkId} v={v} label={v.court ? `Court ${v.court}` : undefined} />)
            ) : (
              <p className="text-sm text-muted">No streams or videos linked yet.</p>
            )}
          </div>
        </Section>
      </aside>
    </div>
  );
}

function Schedule({
  matches,
  t,
  day,
  href,
}: {
  matches: MatchCard[];
  t: { timezone: string; startDate: string; endDate: string };
  day: string;
  href: (p: Record<string, string>) => string;
}) {
  const dated = matches.filter((m) => m.scheduledAt);
  const days = [...new Set(dated.map((m) => dateInZone(m.scheduledAt!, t.timezone)))].sort();
  if (!days.length) return <p className="text-sm text-muted">No match times published yet.</p>;
  const today = dateInZone(new Date(), t.timezone);
  const active = days.includes(day) ? day : days.includes(today) ? today : days[0];
  const list = dated.filter((m) => dateInZone(m.scheduledAt!, t.timezone) === active);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {days.map((d) => (
          <Link
            key={d}
            href={href({ day: d })}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-sm ${d === active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
          >
            <span className="block text-[11px] uppercase">Day {daysBetween(t.startDate, d) + 1}</span>
            {formatDay(d)}
          </Link>
        ))}
      </div>
      <MatchList matches={list} />
    </div>
  );
}

function Draws({
  matches,
  event,
  href,
}: {
  matches: MatchCard[];
  event: string;
  href: (p: Record<string, string>) => string;
}) {
  const keys = DISCIPLINES.flatMap((d) =>
    (["main", "qualifying"] as const)
      .filter((dt) => matches.some((m) => m.discipline === d && m.drawType === dt))
      .map((dt) => ({ key: dt === "main" ? d : `${d}-Q`, discipline: d, drawType: dt })),
  );
  const active = keys.find((k) => k.key === event) ?? keys[0];
  if (!active) return null;
  const list = matches.filter((m) => m.discipline === active.discipline && m.drawType === active.drawType);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <Link
            key={k.key}
            href={href({ event: k.key })}
            className={`rounded-md border px-3 py-1.5 text-sm ${k.key === active.key ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
            title={DISCIPLINE_LABELS[k.discipline as Discipline]}
          >
            {k.discipline}
            {k.drawType === "qualifying" ? " qualifying" : ""}
          </Link>
        ))}
      </div>
      <h2 className="text-sm text-muted">
        {DISCIPLINE_LABELS[active.discipline]}
        {active.drawType === "qualifying" ? ", qualifying" : ""}
      </h2>
      <Bracket matches={list} />
    </div>
  );
}

function Results({ matches }: { matches: MatchCard[] }) {
  const done = matches.filter((m) => m.status !== "scheduled" && m.status !== "live");
  if (!done.length) return <p className="text-sm text-muted">No results yet.</p>;
  const rounds = [...new Set(done.map((m) => m.roundIndex))].sort((a, b) => b - a);
  return (
    <div className="space-y-6">
      {rounds.map((r) => {
        const list = done.filter((m) => m.roundIndex === r);
        return (
          <Section key={r} title={roundLabel(list[0].round)}>
            <MatchList matches={list} />
          </Section>
        );
      })}
    </div>
  );
}

function Watch({ videos, t }: { videos: VideoCard[]; t: { startDate: string } }) {
  if (!videos.length) return <p className="text-sm text-muted">No streams or videos linked yet.</p>;
  const courts = videos.filter((v) => v.court && !v.matchId);
  const others = videos.filter((v) => !v.court || v.matchId);
  const days = [...new Set(courts.map((v) => v.day!))].sort().reverse();
  return (
    <div className="space-y-8">
      {days.length ? (
        <Section title="Court streams">
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d} className="space-y-2">
                <h3 className="text-sm font-medium">
                  Day {daysBetween(t.startDate, d) + 1} · {formatDay(d)}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {courts
                    .filter((v) => v.day === d)
                    .map((v) => (
                      <VideoLink key={v.linkId} v={v} label={`Court ${v.court}`} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {others.length ? (
        <Section title="Matches and highlights">
          <div className="grid gap-2 sm:grid-cols-2">
            {others.map((v) => (
              <VideoLink key={v.linkId} v={v} start={v.offsetSec} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
