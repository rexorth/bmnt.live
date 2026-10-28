import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Country } from "@/components/badges";
import { MatchList } from "@/components/match-row";
import { Section } from "@/components/section";
import { getPlayer } from "@/server/queries";

const loadPlayer = cache(getPlayer);

export async function generateMetadata({ params }: PageProps<"/players/[slug]">): Promise<Metadata> {
  const d = await loadPlayer((await params).slug);
  return d ? { title: d.player.name, description: `${d.player.name}: upcoming matches, results and videos.` } : {};
}

export default async function PlayerPage({ params }: PageProps<"/players/[slug]">) {
  const d = await loadPlayer((await params).slug);
  if (!d) notFound();
  const { player: p, record } = d;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <Country code={p.country} />
          {record.wins + record.losses ? (
            <span>
              {record.wins}–{record.losses} in matches on record
            </span>
          ) : null}
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          {d.upcoming.length ? (
            <Section title="Upcoming and live">
              <MatchList matches={d.upcoming} showTournament />
            </Section>
          ) : null}
          <Section title="Results">
            <MatchList matches={d.results} showTournament empty="No results on record yet." />
          </Section>
        </div>
        {d.partners.length ? (
          <aside>
            <Section title="Partners">
              <ul className="overflow-hidden rounded-lg border border-line bg-surface text-sm">
                {d.partners.map(({ player, matches }) => (
                  <li key={player.id} className="flex justify-between border-b border-line px-3 py-2 last:border-b-0">
                    <Link href={`/players/${player.slug}`} className="hover:underline">
                      {player.name}
                    </Link>
                    <span className="text-muted">{matches} matches</span>
                  </li>
                ))}
              </ul>
            </Section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
