# bmnt.live

Professional badminton in one place: tournament calendar, draws, live scores, match times in your own timezone, and links to every stream and recording we can find.

## Status

| Part                                                                                                                                   | State                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site: home, calendar, tournament (overview, schedule, draws, results, watch), match, player, search, admin review                      | Working                                                                                                                                                                                                      |
| Search by player, tournament, or dates ("March 2027", "next week", "2027")                                                             | Working                                                                                                                                                                                                      |
| YouTube: follows BWF TV, Badminton Asia, Badminton Europe, Badminton Oceania; links full matches, highlights and all-day court streams | Working with real data                                                                                                                                                                                       |
| Tournament calendar                                                                                                                    | Curated in `data/tournaments.json` until BWF's calendar endpoint is confirmed                                                                                                                                |
| BWF draws, schedules and scores                                                                                                        | **Written but unverified.** BWF's API wasn't reachable from the build environment, so the mapper in `src/ingest/sources/bwf/map.ts` tries several likely field names. Capture a real response first (below). |

## Quick start

```sh
cp .env.example .env          # fill in YOUTUBE_API_KEY and ADMIN_TOKEN
docker compose up -d          # Postgres 16 on localhost:5432
pnpm install
pnpm db:migrate
pnpm ingest calendar          # tournaments from data/tournaments.json
pnpm ingest youtube --pages 4 # recent videos from followed channels
pnpm db:seed                  # optional: fictional sample tournaments with full draws
pnpm dev
```

`pnpm db:seed` loads clearly labelled **sample data** (fictional players, "(sample data)" in every tournament name) so brackets and match pages can be developed before real draws are flowing. Remove it with `pnpm db:seed --clear`. Never run it in production.

## Commands

| Command                                    | Does                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev` / `pnpm build` / `pnpm start`   | Next.js app                                                                                                                                |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Checks. `pnpm test` runs the integration tests too when `DATABASE_URL_TEST` is set (that database is wiped).                               |
| `pnpm test:e2e`                            | Playwright against a production build loaded with `pnpm db:seed`                                                                           |
| `pnpm db:generate`                         | New migration after editing `src/db/schema.ts`                                                                                             |
| `pnpm ingest <job>`                        | `calendar`, `tournament <slug>`, `recent`, `live`, `youtube [--pages N]`, `relink`, `add-channel <id or @handle>`, `capture <code> <date>` |

## How it fits together

```
BWF API ─┐                                    ┌─ public pages (Next.js, src/app)
         ├─ pnpm ingest (src/ingest) ─ Postgres ┤
YouTube ─┘   on a GitHub Actions schedule      └─ /admin review queue
```

- **Ingestion** (`src/ingest`): every source maps into the shapes in `types.ts`; `upsert.ts` writes them idempotently, keyed by `external_ids`. Raw responses are kept in `raw_payloads` and every run is logged in `ingest_runs`.
- **Video matching** (`src/ingest/match-videos.ts`): parses titles such as `YONEX French Open 2026 | An Se Young (KOR) [1] vs Pusarla V. Sindhu (IND) | F` and scores candidate matches on players, round, tournament and timing. Confident matches go live; uncertain ones wait at `/admin`. Court streams (`… | Day 2 | Court 3 | …`) attach to that tournament day and court, and match pages deep-link into them at the expected start.
- **Times** are stored in UTC and shown in the viewer's timezone, with a toggle to venue time.

## Getting BWF data working

1. Allow the BWF hosts (see DEPLOY.md) or run from a machine that can reach them.
2. Find a tournament's BWF code (the GUID in its bwfworldtour.bwfbadminton.com URL) and add it as `bwfCode` in `data/tournaments.json`.
3. `pnpm ingest capture <code> <YYYY-MM-DD>` saves the raw response to `tests/fixtures/bwf/` and reports how many records mapped.
4. Adjust the field lists in `src/ingest/sources/bwf/map.ts` to what BWF actually sends, replace the hand-written test fixture in `tests/unit/bwf-map.test.ts` with the capture, then `pnpm ingest calendar && pnpm ingest tournament <slug>`.

The BWF endpoint is undocumented and may change without notice; a response that maps to nothing fails the run loudly rather than wiping data.
