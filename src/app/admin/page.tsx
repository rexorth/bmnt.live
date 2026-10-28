import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VideoLink } from "@/components/video";
import { roundLabel } from "@/lib/rounds";
import { isAdmin, logout, reviewLink } from "@/server/actions";
import { getPendingLinks } from "@/server/queries";

export const metadata: Metadata = { title: "Review videos", robots: { index: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const pending = await getPendingLinks();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Videos waiting for review</h1>
        <form action={logout}>
          <button className="text-sm text-muted hover:text-ink">Sign out</button>
        </form>
      </div>
      {!pending.length ? <p className="text-sm text-muted">Nothing to review.</p> : null}
      <ul className="space-y-3">
        {pending.map((l) => (
          <li key={l.linkId} className="space-y-2 rounded-lg border border-line bg-surface p-3">
            <div className="text-sm">
              {l.origin === "user"
                ? "Suggested by a visitor"
                : `Matched automatically (${Math.round((l.confidence ?? 0) * 100)}%)`}
              {" for "}
              {l.matchId ? (
                <Link href={`/matches/${l.matchId}`} className="text-accent hover:underline">
                  {l.tournamentName} · {l.matchRound ? roundLabel(l.matchRound) : "match"}
                </Link>
              ) : (
                <span>{l.tournamentName ?? "unknown tournament"}</span>
              )}
              {l.note ? <span className="block text-muted">&ldquo;{l.note}&rdquo;</span> : null}
            </div>
            <VideoLink v={l} start={l.offsetSec} />
            <form action={reviewLink} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="linkId" value={l.linkId} />
              <label className="text-xs text-muted">
                Start (seconds){" "}
                <input
                  name="offsetSec"
                  inputMode="numeric"
                  defaultValue={l.offsetSec ?? ""}
                  className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-sm"
                />
              </label>
              <button
                name="decision"
                value="approved"
                className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-ink"
              >
                Approve
              </button>
              <button name="decision" value="rejected" className="rounded-md border border-line px-3 py-1 text-sm">
                Reject
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
