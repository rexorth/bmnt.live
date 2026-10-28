"use client";

import { useActionState } from "react";
import { suggestVideo, type FormState } from "@/server/actions";

export function SuggestVideo({ matchId }: { matchId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(suggestVideo, null);
  return (
    <form action={action} className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <h3 className="text-sm font-medium">Know where this match was shown?</h3>
      <p className="text-xs text-muted">
        Paste a YouTube link. Add <code>&amp;t=</code> to jump to the start of the match. Links appear after review.
      </p>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <input
        type="url"
        name="url"
        required
        placeholder="https://www.youtube.com/watch?v=…"
        aria-label="YouTube link"
        className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <input
        type="text"
        name="note"
        maxLength={300}
        placeholder="Note (optional), e.g. court 2 stream"
        aria-label="Note"
        className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-60"
        >
          {pending ? "Sending…" : "Suggest video"}
        </button>
        {state ? (
          <p role="status" className={`text-sm ${state.ok ? "text-accent" : "text-live"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
