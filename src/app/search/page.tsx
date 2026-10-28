import type { Metadata } from "next";
import Link from "next/link";
import { Country } from "@/components/badges";
import { Section } from "@/components/section";
import { TournamentTable } from "@/components/tournament-card";
import { search } from "@/server/queries";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (!q) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="text-sm text-muted">
          Search by player, tournament or dates: &ldquo;Axelsen&rdquo;, &ldquo;French Open&rdquo;, &ldquo;March
          2027&rdquo;, &ldquo;next week&rdquo;.
        </p>
      </div>
    );
  }
  const r = await search(q.slice(0, 100));
  const nothing = !r.players.length && !r.tournaments.length;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        Results for &ldquo;{q}&rdquo;
        {r.range ? (
          <span className="block text-sm font-normal text-muted">
            Dates read as {r.range.from} to {r.range.to}
          </span>
        ) : null}
      </h1>
      {nothing ? <p className="text-sm text-muted">Nothing found. Try a surname or a tournament name.</p> : null}
      {r.players.length ? (
        <Section title="Players">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.players.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/players/${p.slug}`}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-accent"
                >
                  {p.name}
                  <Country code={p.country} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.tournaments.length ? (
        <Section title="Tournaments">
          <TournamentTable list={r.tournaments} />
        </Section>
      ) : null}
    </div>
  );
}
