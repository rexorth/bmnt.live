"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/server/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  return (
    <form action={action} className="space-y-2">
      <input
        type="password"
        name="token"
        required
        autoComplete="current-password"
        placeholder="Admin token"
        aria-label="Admin token"
        className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <button disabled={pending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">
        Sign in
      </button>
      {state && !state.ok ? <p className="text-sm text-live">{state.message}</p> : null}
    </form>
  );
}
