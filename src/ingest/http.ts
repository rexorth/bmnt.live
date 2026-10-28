import { createHash } from "node:crypto";
import type { Db } from "@/db";
import { rawPayloads } from "@/db/schema";

export const USER_AGENT = "bmnt.live-ingest/0.1 (+https://bmnt.live)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchJsonOptions = {
  source: string;
  db?: Db;
  // Hide secrets (API keys) from the stored URL.
  redact?: (url: string) => string;
  headers?: Record<string, string>;
  retries?: number;
  minIntervalMs?: number;
};

const lastCall = new Map<string, number>();

// GET a JSON document politely: one request at a time per source, retries with
// backoff on 429/5xx/network errors, and the raw body kept for replay.
export async function fetchJson(url: string, opts: FetchJsonOptions): Promise<unknown> {
  const { source, retries = 4, minIntervalMs = 500 } = opts;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastCall.get(source) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(source, Date.now());
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, opts.redact?.(url) ?? url, text);
      const json: unknown = JSON.parse(text);
      if (opts.db) {
        await opts.db.insert(rawPayloads).values({
          source,
          url: opts.redact?.(url) ?? url,
          hash: createHash("sha256").update(text).digest("hex"),
          payload: json,
        });
      }
      return json;
    } catch (err) {
      const retryable = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
      if (!retryable || attempt >= retries) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
}
