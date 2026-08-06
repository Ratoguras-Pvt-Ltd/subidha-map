# Deploying to Vercel

Written for the **Hobby (free)** plan, which allows a single cron job — spent on the
nightly stock reset.

Follow the steps in order. Steps 1–4 get the site up; step 5 puts the dealers in the
database; step 6 sets up the nightly reset.

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

## 7. Verify the deployment

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

---

## Known limitations

**Nightly reset drifts by up to an hour.** Hobby-plan crons have ±59 min precision, so
the reset fires somewhere between 00:00 and 00:59 Nepal time rather than exactly at
midnight. Stock is a "delivered today" number that nobody reads at 00:30, so this is
accepted rather than worked around.

**Hobby allows one cron per day.** It is spent on the nightly reset. Anything else that
needs a schedule has to come from outside Vercel.

**Re-running the import** overwrites `address`, `district` and `municipality` from
Nominatim (which is what repairs a `--skip-geocode` pass), fills `phone` only when it is
blank, and **never touches stock quantities or status**. Use `--skip-geocode` to
preserve manual address edits.
