# Deploying to Vercel

## 1. Create the database (Neon)

Easiest path is the Vercel Marketplace, which wires the connection strings in for you:

1. Vercel dashboard → your project → **Storage** → **Create Database** → **Neon**.
2. Accept the defaults and pick a region close to your users (`ap-southeast-1`
   Singapore is the nearest to Nepal).

Vercel injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically. This project
expects the unpooled one as `DIRECT_URL`, so add that alias:

```bash
vercel env add DIRECT_URL production   # paste the DATABASE_URL_UNPOOLED value
```

> `DATABASE_URL` must be the **pooled** URL (host contains `-pooler`). Serverless
> functions open a connection per invocation and will exhaust a direct connection
> limit. `DIRECT_URL` must be the unpooled one — Prisma migrations need a real
> session.

Doing it by hand instead? Create a project at [neon.tech](https://neon.tech), copy
both connection strings, and set them as env vars.

## 2. Set the remaining environment variables

```bash
vercel env add AUTH_SECRET production        # openssl rand -base64 32
vercel env add CRON_SECRET production        # openssl rand -hex 32
vercel env add ADMIN_EMAIL production
vercel env add ADMIN_PASSWORD production     # 12+ characters
vercel env add GEOCODE_CONTACT production
vercel env add NEXT_PUBLIC_SITE_URL production   # https://your-domain.com
vercel env add ERP_FEED_URL production       # https://marutigas.ratoguras.com/api/dealer-stock/today
vercel env add ERP_FEED_SECRET production    # must equal DEALER_MAP_API_SECRET in the ERP's .env
```

`CRON_SECRET` is not optional in production: Vercel sends it as
`Authorization: Bearer …` to the nightly reset endpoint, and without it the only
other accepted caller is a logged-in admin — meaning the scheduled run would be
rejected and stock would never clear.

Leave `AUTH_URL` unset — Auth.js infers it from the deployment.

Repeat for the `preview` environment if you want working preview deployments.

## 3. Run migrations on deploy

Set the build command so the schema is applied before the app builds:

**Project Settings → Build & Development Settings → Build Command:**

```
prisma migrate deploy && next build
```

`prisma generate` already runs via the `postinstall` script, which matters because
Prisma 7 generates the client into `src/generated/` rather than `node_modules` and
that directory is gitignored.

## 4. Deploy

```bash
vercel --prod
```

## 5. Seed and import — once, against production

Both scripts are one-off admin tasks, not part of the build. Run them locally with
your production connection string:

```bash
# Use the DIRECT (unpooled) URL for these — they are long-running, not serverless.
DATABASE_URL="<unpooled-neon-url>" npm run seed
DATABASE_URL="<unpooled-neon-url>" npm run import
```

The import takes ~7 minutes the first time because of the 1 req/sec Nominatim limit.
If `scripts/geocode-cache.json` is committed (it should be), it finishes in seconds
and makes no network calls.

Then sign in at `https://your-domain.com/admin/login` and start entering stock.

## 6. The nightly stock reset

`vercel.json` already registers the cron:

```json
{ "path": "/api/cron/reset-stock", "schedule": "15 18 * * *" }
```

Vercel cron schedules are **UTC**. Nepal is a fixed UTC+05:45 with no daylight
saving, so `18:15 UTC` is `00:00` in Kathmandu — every night, all year.

Confirm it registered under **Project → Settings → Cron Jobs** after the first
production deploy. Crons only run on **production** deployments, never previews.

On the Hobby plan you get 2 cron jobs at once-per-day granularity, which is exactly
what this needs. Test it without waiting for midnight:

```bash
curl -X POST https://your-domain.com/api/cron/reset-stock \
  -H "Authorization: Bearer $CRON_SECRET"
# => {"ok":true,"ranAt":"…","timezone":"Asia/Kathmandu","dealersReset":N,"cylindersCleared":M}
```

## 7. The ERP dispatch sync

Stock numbers no longer have to be typed in by hand. `/api/cron/sync-erp-stock` pulls
today's dispatched cylinder counts from the Subidha Gas ERP and writes them onto the
matching dealers:

```json
{ "path": "/api/cron/sync-erp-stock", "schedule": "0 * * * *" }
```

**This hourly schedule needs the Pro plan.** Hobby allows 2 crons at once-per-day
granularity — enough slots for both jobs, but a daily sync would only ever show the
one moment it ran. Two ways round it on Hobby:

- Change the schedule to a single useful time of day (e.g. `30 12 * * *` = 18:15 in
  Kathmandu, after the day's dispatching) and accept one refresh per day, or
- have the ERP trigger it after each dispatch — the route accepts `POST` with the same
  bearer token, so nothing here needs to change.

Dealers are matched **by name**, since the two systems keep separate dealer lists with
no shared id. The response reports what did not line up, and it is worth reading after
the first run:

```bash
curl -X POST https://your-domain.com/api/cron/sync-erp-stock \
  -H "Authorization: Bearer $CRON_SECRET"
# => {"ok":true,"date":"2026-08-06","matched":37,"updated":12,"unmatched":[…],"ambiguous":[…]}
```

`unmatched` names exist in the ERP but not here (or are spelled differently);
`ambiguous` names collide with two local dealers, so the sync refuses to guess which
one gets the stock. Both are fixed by renaming on one side or the other.

Quantities are *set*, never added, so re-running the sync mid-day is harmless. Dealers
absent from the feed are left alone rather than zeroed — that is the nightly reset's job,
and zeroing here would wipe any count an admin entered by hand.

## 8. Verify the deployment

- [ ] Homepage renders the clustered map; zooming in splits the clusters.
- [ ] Dealer count in the header reads **390**.
- [ ] `/api/dealers` returns `{"count": 390, ...}`.
- [ ] `/admin` redirects to `/admin/login` when signed out.
- [ ] Login works; a wrong password gives a generic error.
- [ ] Updating one dealer's stock to 120 turns its pin **green** on the public map
      after a reload, and the change appears in `/admin/history`.
- [ ] `/sitemap.xml` lists the dealer pages.
- [ ] `/robots.txt` disallows `/admin`.
- [ ] `/api/cron/reset-stock` returns **401** with no `Authorization` header.
- [ ] The same call with the correct bearer token returns `{"ok":true,…}`, zeroes the
      dashboard totals, and adds "Nightly reset" rows to `/admin/history`.
- [ ] `/api/cron/sync-erp-stock` returns **401** with no `Authorization` header, and
      **502** with a valid token but `ERP_FEED_URL` unset.
- [ ] With both env vars set, it returns `{"ok":true,"matched":N,…}` and the dispatched
      quantities show on the public map as "ERP dispatch sync" rows in `/admin/history`.

---

## Notes

**Region.** Put the functions in the same region as the database
(Project Settings → Functions → Region → Singapore) — a cross-region round trip on
every query is the single biggest avoidable latency here.

**Custom domain.** Add it under Project Settings → Domains, then update
`NEXT_PUBLIC_SITE_URL` so canonical URLs, OG tags and the sitemap point at the real
host.

**Schema changes.** Always `npx prisma migrate dev` locally and commit the generated
migration. Never `prisma db push` against production — it can drop columns without
warning.

**Re-importing later.** Safe at any time. Matching is on `sourceKey`, only blank
fields get filled, and stock is never touched after the initial insert.
