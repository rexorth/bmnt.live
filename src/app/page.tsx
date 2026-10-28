import { LiveDot } from "@/components/badges";
import { MatchList } from "@/components/match-row";
import { Section } from "@/components/section";
import { TournamentCard } from "@/components/tournament-card";
import { getHomeData } from "@/server/queries";

export default async function Home() {
  const d = await getHomeData();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        {d.live.length ? (
          <Section
            title={
              <span className="inline-flex items-center gap-2 text-live">
                <LiveDot /> Live now
              </span>
            }
          >
            <MatchList matches={d.live} showTournament />
          </Section>
        ) : null}
        <Section title="Up next">
          <MatchList matches={d.upNext} showTournament empty="No matches scheduled in the next 36 hours." />
        </Section>
        <Section title="Recent results">
          <MatchList matches={d.recent} showTournament empty="No results in the last three days." />
        </Section>
      </div>
      <aside className="space-y-8">
        {d.liveTournaments.length ? (
          <Section title="In progress">
            <div className="space-y-2">
              {d.liveTournaments.map((t) => (
                <TournamentCard key={t.id} t={t} />
              ))}
            </div>
          </Section>
        ) : null}
        <Section title="Upcoming" href="/tournaments?status=upcoming">
          <div className="space-y-2">
            {d.upcomingTournaments.length ? (
              d.upcomingTournaments.map((t) => <TournamentCard key={t.id} t={t} />)
            ) : (
              <p className="text-sm text-muted">Nothing on the calendar yet.</p>
            )}
          </div>
        </Section>
        {d.recentTournaments.length ? (
          <Section title="Just finished" href="/tournaments?status=completed">
            <div className="space-y-2">
              {d.recentTournaments.map((t) => (
                <TournamentCard key={t.id} t={t} />
              ))}
            </div>
          </Section>
        ) : null}
      </aside>
    </div>
  );
}
