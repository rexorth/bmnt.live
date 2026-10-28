# Deploying bmnt.live

Recommended setup: **Vercel** runs the site, **Neon** hosts Postgres, **GitHub Actions** runs ingestion on a schedule, and **GoDaddy** keeps the domain registration with DNS pointed at Vercel. All four have free tiers that cover launch traffic. Check the current plan terms: Vercel's free Hobby plan is for non-commercial use.

## 1. Database (Neon)

1. Create a Neon project (Postgres 16 or newer) and copy two connection strings:
   - the **pooled** one (host contains `-pooler`) for the website
   - the **direct** one for migrations and ingestion
2. From your machine, apply migrations and load the calendar:
   ```sh
   DATABASE_URL="<direct url>" pnpm db:migrate
   DATABASE_URL="<direct url>" pnpm ingest calendar
   DATABASE_URL="<direct url>" YOUTUBE_API_KEY=... pnpm ingest youtube --pages 4
   ```
   Do not run `pnpm db:seed` against production.

## 2. Site (Vercel)

1. Import `rexorth/bmnt.live` in Vercel; it detects Next.js. Production branch: `main`.
2. Environment variables (Production):
   - `DATABASE_URL`: the pooled Neon URL
   - `DATABASE_PREPARE`: `false` (required with the pooled URL)
   - `YOUTUBE_API_KEY`: used when visitors suggest a video
   - `ADMIN_TOKEN`: a long random string, e.g. `openssl rand -hex 32`
3. Deploy, then open the `*.vercel.app` URL and check a tournament page.

## 3. Domain (GoDaddy → Vercel)

1. In Vercel: Project → Settings → Domains → add `bmnt.live` and `www.bmnt.live`, and choose which one redirects to the other.
2. Vercel then shows the exact DNS records to create. Use those values. They are typically:
   | Type  | Name  | Value                  |
   | ----- | ----- | ---------------------- |
   | A     | `@`   | `76.76.21.21`          |
   | CNAME | `www` | `cname.vercel-dns.com` |
3. In GoDaddy: My Products → bmnt.live → DNS → Manage DNS. Delete GoDaddy's default "Parked" `A @` record and any existing `www` record, then add the records from step 2.
4. Wait for Vercel to show both domains as valid. HTTPS certificates are issued automatically. DNS changes usually apply within an hour but can take up to 48.

## 4. Scheduled ingestion (GitHub Actions)

In the GitHub repo, go to Settings → Secrets and variables → Actions:

- Secrets:
  - `DATABASE_URL`: the **direct** Neon URL
  - `YOUTUBE_API_KEY`
- Variable: `INGEST_ENABLED` = `true`

The `Ingest` workflow then runs:

- `live` every 10 minutes
- `recent` and `youtube` hourly
- `calendar` daily

Any job can also be run by hand from the Actions tab. The repo is public, so these minutes are free.

YouTube quota: each `youtube` run costs about one unit per followed channel plus one per 50 videos, far below the 10,000-unit daily default.

## 5. Keys and access

- Restrict the YouTube key in Google Cloud Console to the YouTube Data API v3. A key that has been pasted into chat or anywhere public should be rotated before launch.
- Sign in at `https://bmnt.live/admin/login` with `ADMIN_TOKEN` to review video suggestions.

## Development environment network access

The Claude Code cloud environment blocks hosts by default. To develop and test ingestion there, add these under the environment's Network access → Allowed domains:

- `extranet-lv.bwfbadminton.com`
- `bwfbadminton.com`
- `www.bwfbadminton.com`
- `bwfworldtour.bwfbadminton.com`
- `*.bwfbadminton.com` (if wildcards are accepted)
- `www.googleapis.com` (already reachable)
- `www.youtube.com`
- `i.ytimg.com`
