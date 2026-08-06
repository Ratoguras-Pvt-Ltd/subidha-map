# Deploying to Vercel

Written for the **Hobby (free)** plan, which shapes two decisions you will see below:
only one cron job runs on Vercel, and the hourly ERP sync runs from GitHub Actions
instead.

Follow the steps in order. Steps 1–4 get the site up; step 5 puts the dealers in the
database; step 6 is only needed once the ERP feed exists.

---

## 1. Import the repository

Vercel dashboard → **Add New** → **Project** → import
`Ratoguras-Pvt-Ltd/subidha-map` → **Next.js** is detected automatically.

Do not deploy yet — it will fail without a database. Add the environment variables
first.

`vercel.json` already sets the build command:

```json
"buildCommand": "prisma migrate deploy && npm run build"
```

That applies migrations before the build, so the schema is never behind the code. You do
not need to set a build command in the dashboard.

## 2. Create the database (Neon)

Easiest path is the Vercel Marketplace, which wires the connection strings in for you:

1. Vercel dashboard → your project → **Storage** → **Create Database** → **Neon**.
2. Accept the defaults and pick a region close to your users (`ap-southeast-1`
   Singapore is the nearest to Nepal).

Vercel injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically. This project
expects the unpooled one as **`DIRECT_URL`**, so add that alias by hand — nothing else
creates it:

```bash
vercel env add DIRECT_URL production   # paste the DATABASE_URL_UNPOOLED value
```

> `DATABASE_URL` must be the **pooled** URL (host contains `-pooler`). Serverless
> functions open a connection per invocation and will exhaust a direct connection
> limit. `DIRECT_URL` must be the unpooled one — `prisma migrate deploy` needs a real
> session.

Doing it by hand instead? Create a project at [neon.tech](https://neon.tech), copy
both connection strings, and set them as env vars.

## 3. Set the environment variables

| Variable | Needed | Notes |
| --- | --- | --- |
| `DATABASE_URL` | deploy | Neon **pooled** URL (`-pooler` in the host) |
| `DIRECT_URL` | deploy | Neon **unpooled** URL; used by `prisma migrate deploy` |
| `AUTH_SECRET` | deploy | 32 random bytes, base64 — `openssl rand -base64 32` |
| `CRON_SECRET` | deploy | 32 random bytes, hex — `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | deploy | Final public URL. Feeds canonical tags, OG images and the sitemap, so a placeholder here ships wrong metadata |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `npm run seed` | Password **12+ characters**; the seed script refuses anything shorter or obviously placeholder |
| `GEOCODE_CONTACT` | `npm run import` | Contact address for the Nominatim `User-Agent`, required by its usage policy |
| `ERP_FEED_URL` | later | `https://marutigas.ratoguras.com/api/dealer-stock/today`. Leave unset for now |
| `ERP_FEED_SECRET` | later | Must equal `DEALER_MAP_API_SECRET` in the ERP's `.env`. Leave unset for now |

`CRON_SECRET` is not optional in production: Vercel sends it as `Authorization:
Bearer …` to the nightly reset, and the only other accepted caller is a logged-in
admin — so without it the scheduled run is rejected and stock never clears.

Leave `AUTH_URL` unset — Auth.js infers it from the deployment.

Repeat for the `preview` environment if you want working preview deployments.

## 4. Deploy

```bash
vercel --prod
```

`postinstall` runs `prisma generate`, which is load-bearing: Prisma 7 generates the
client into `src/generated/prisma`, and that directory is gitignored. Do not remove that
script.

## 5. Seed the admin and import the dealers

Both are one-off, and both run **from your machine against the production database**,
using the **unpooled** URL. The KML source (`Maruti Gas Dealer (1).kmz/`) is gitignored,
so the import cannot run on Vercel — it only exists locally.

```bash
DATABASE_URL="<unpooled production URL>" npm run seed
DATABASE_URL="<unpooled production URL>" npm run import
```

The import must report exactly **390 dealers** — it asserts this and exits non-zero
otherwise, so a parser regression fails loudly instead of quietly importing a fraction
of the network. `scripts/geocode-cache.json` is committed (390 entries), so no
geocoding network calls are made and this finishes in seconds.

Then sign in at `https://your-domain.com/admin/login`.

## 6. The nightly stock reset

`vercel.json` registers one cron, which is all the Hobby plan allows:

```json
{ "path": "/api/cron/reset-stock", "schedule": "15 18 * * *" }
```

Vercel cron schedules are **UTC**. Nepal is a fixed UTC+05:45 with no daylight saving,
so `18:15 UTC` is `00:00` in Kathmandu — every night, all year.
`tests/import.test.ts` asserts the schedule and the timezone still agree, in both
January and July, so editing the cron without updating the test fails the build.

Confirm it registered under **Project → Settings → Cron Jobs** after the first
production deploy. Crons only run on **production** deployments, never previews.

Test it without waiting for midnight:

```bash
curl -X POST https://your-domain.com/api/cron/reset-stock \
  -H "Authorization: Bearer $CRON_SECRET"
# => {"ok":true,"ranAt":"…","timezone":"Asia/Kathmandu","dealersReset":N,"cylindersCleared":M}
```

## 7. The ERP stock sync (enable once the ERP feed is configured)

Stock numbers can come from the Subidha Gas ERP instead of being typed in by hand:
`/api/cron/sync-erp-stock` pulls today's dispatched cylinder counts and writes them onto
the linked dealers.

This runs from **GitHub Actions**, not a Vercel cron — see the limitation note below.
The workflow is `.github/workflows/erp-sync.yml`, hourly, and it stays dormant until you
switch it on.

**a. ERP side.** On `marutigas.ratoguras.com`, set the shared secret and clear the
config cache (Laravel caches config in production, so editing `.env` alone changes
nothing):

```bash
echo 'DEALER_MAP_API_SECRET=<a new random hex string>' >> .env
php artisan config:clear && php artisan config:cache
```

Verify: no token must give 401, the right token must give JSON.

```bash
curl -s https://marutigas.ratoguras.com/api/dealer-stock/today            # 401
curl -s https://marutigas.ratoguras.com/api/dealer-stock/today \
  -H "Authorization: Bearer <the secret>"                                  # {"date":…,"dealers":[…]}
```

A `503 Dealer map feed is not configured.` means the secret is still unset or the config
cache is stale.

**b. Vercel side.** Add `ERP_FEED_URL` and `ERP_FEED_SECRET` (the same string as
`DEALER_MAP_API_SECRET`), then redeploy so the functions pick them up.

**c. Link the dealers.** This step is mandatory and easy to miss — without it the sync
runs, reports success, and updates nothing. The two systems keep separately-authored
dealer lists, so each dealer here has to record its ERP `vendors.id`:

```bash
npm run link-erp                          # report: who is linked, who is not
npm run link-erp -- --auto                # link the unambiguous name matches (101 of 349)
npm run link-erp -- --template todo.csv   # export the remaining 248 with suggestions
npm run link-erp -- --csv todo.csv        # apply the filled-in file
```

Names alone cannot do this job: only 4 of 349 ERP names match a dealer here exactly
("Aakansha Jeneral Store,Birendra Bazar" against "Karki Suppler"), and loosening the
match far enough to help starts colliding, which would credit one dealer's cylinders to
another. So `--auto` writes only where a name resolves to exactly one dealer, and
everything else waits for a human.

**d. GitHub side.** Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `PROD_URL` | `https://your-domain.com` (no trailing slash needed) |
| Secret | `CRON_SECRET` | the same value as Vercel's `CRON_SECRET` |
| Variable | `ERP_SYNC_ENABLED` | `true` — **set this last**, it is the on switch |

Until `ERP_SYNC_ENABLED` is `true`, the workflow skips every run, so nothing fails on a
schedule while the feed is still being set up. Test by hand from the **Actions** tab
(**Run workflow**) before enabling the schedule.

```bash
curl -X POST https://your-domain.com/api/cron/sync-erp-stock \
  -H "Authorization: Bearer $CRON_SECRET"
# => {"ok":true,"date":"…","matched":37,"updated":12,"unlinked":[…]}
```

`unlinked` is the list worth reading: those dealers dispatched cylinders today and none
of it reached the map, because nobody has linked them yet.

## 8. Verify the deployment

- [ ] Homepage renders the clustered map; zooming in splits the clusters.
- [ ] Dealer count in the header reads **390**.
- [ ] `/api/dealers` returns `{"count": 390, …}` — the feed carries the whole network;
      hiding out-of-stock dealers happens in the UI, not in the query.
- [ ] `/admin` redirects to `/admin/login` when signed out.
- [ ] Login works; a wrong password gives a generic error.
- [ ] Updating one dealer's stock to 120 turns its pin **green** on the public map after
      a reload, and the change appears in `/admin/history`.
- [ ] `/sitemap.xml` lists the dealer pages.
- [ ] `/robots.txt` disallows `/admin`.
- [ ] `/api/cron/reset-stock` returns **401** with no `Authorization` header, and
      `{"ok":true,…}` with the right bearer token — zeroing the dashboard totals and
      adding "Nightly reset" rows to `/admin/history`.
- [ ] `/api/cron/sync-erp-stock` returns **401** with no header, and **502** with a valid
      token while `ERP_FEED_URL` is unset. Both are correct before step 7.

---

## Known limitations

**Nightly reset drifts by up to an hour.** Hobby-plan crons have ±59 min precision, so
the reset fires somewhere between 00:00 and 00:59 Nepal time rather than exactly at
midnight. Stock is a "delivered today" number that nobody reads at 00:30, so this is
accepted rather than worked around.

**The ERP sync cannot be a Vercel cron on Hobby.** Vercel rejects any schedule running
more than once per day *at deploy time* ("Hobby accounts are limited to daily cron
jobs"), and a once-daily sync would show one arbitrary moment of the day's dispatching.
Hence GitHub Actions. The route itself is a normal endpoint and stays callable by bearer
token, so moving it back to `vercel.json` is a two-line change if the project ever goes
Pro.

**Scheduled GitHub workflows are disabled after 60 days of repository inactivity.** If
the sync goes quiet, check that before debugging the code.

**Every dealer starts with `erpVendorId` null**, so a freshly deployed sync matches
nothing by design. It stays that way until `npm run link-erp` is run — see step 7c.

**Re-running the import** overwrites `address`, `district` and `municipality` from
Nominatim (which is what repairs a `--skip-geocode` pass), fills `phone` only when it is
blank, and **never touches stock quantities or status**. Use `--skip-geocode` to
preserve manual address edits.
