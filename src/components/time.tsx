"use client";

import { useSyncExternalStore } from "react";

type Mode = "local" | "venue";
const KEY = "bmnt:time-mode";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === "venue" ? "venue" : "local";
  } catch {
    return "local";
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function setMode(mode: Mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode: the toggle still works for this page view.
  }
  listeners.forEach((fn) => fn());
}

// The server can't know the viewer's zone, so it renders venue time and the
// client switches to local time (the default) after hydration.
function useMode(): Mode {
  return useSyncExternalStore(subscribe, read, () => "venue");
}

type Style = "time" | "datetime" | "day";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  datetime: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  day: { weekday: "short", day: "numeric", month: "short" },
};

export function Time({
  at,
  tz,
  style = "time",
  zone = false,
}: {
  at: Date | string;
  tz: string;
  style?: Style;
  zone?: boolean;
}) {
  const mode = useMode();
  const date = typeof at === "string" ? new Date(at) : at;
  const timeZone = mode === "venue" ? tz : undefined;
  const text = date.toLocaleString("en-GB", { ...OPTIONS[style], timeZone });
  const zoneName = zone
    ? new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value
    : null;
  return (
    <time dateTime={date.toISOString()} title={mode === "venue" ? "Venue time" : "Your time"}>
      {text}
      {zoneName ? <span className="text-muted"> {zoneName}</span> : null}
    </time>
  );
}

export function TimeModeToggle() {
  const mode = useMode();
  return (
    <div className="flex items-center rounded-md border border-line text-xs" role="group" aria-label="Show times in">
      {(["local", "venue"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
        >
          {m === "local" ? "Your time" : "Venue time"}
        </button>
      ))}
    </div>
  );
}
