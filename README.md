# Subidha Gas Dealer Locator

Public map of every Subidha Gas dealer with live LPG cylinder availability, plus a
password-protected dashboard for staff to keep stock numbers current.

- **Public** — full-screen clustered OpenStreetMap of all dealers, colour-coded by
  stock, with search, filters, "near me", click-to-call and directions.
- **Admin** — dashboard stats, dealer CRUD, stock updates, and an audit trail of
  every change.
- **ERP sync** — an hourly cron pulls today's dispatched cylinder counts from the
  Subidha Gas ERP, so the map shows the day's real deliveries instead of hand-typed
  figures. Manual entry still works, and wins until the next pull. Dealers are matched
  by name; see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §7.

Built with Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui, Prisma 7,
Postgres, Auth.js v5, Leaflet + React Leaflet. No paid mapping APIs.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate dev        # create the schema
npm run import                # load dealers from the KML export
npm run seed                  # create the admin login
npm run dev
```

Public site: <http://localhost:3000> · Dashboard: <http://localhost:3000/admin>

### Environment

Every variable is documented in [`.env.example`](./.env.example). The ones you must
set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection. On Neon use the **pooled** (`-pooler`) URL. |
| `DIRECT_URL` | Unpooled URL for Prisma CLI (migrations, Studio). Optional locally. |
| `AUTH_SECRET` | Session signing key. `openssl rand -base64 32`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin account. Password must be ≥12 chars. |
| `CRON_SECRET` | Authenticates the nightly stock reset. **Required in production.** |
| `GEOCODE_CONTACT` | Contact address for the Nominatim `User-Agent` (required by its policy). |

---

## The dealer data

The source is `Maruti Gas Dealer (1).kmz/doc.kml`, a Google My Maps export. It is
thinner than it looks, and the import is built around what is actually in it:

| | |
| --- | --- |
| Placemarks in file | 411 |
| Driving route (`<LineString>`) + one empty placemark | discarded |
| Exact-coordinate duplicates | 4 merged |
| Same shop pinned 2–31 m away | 15 merged (see below) |
| **Dealers imported** | **390** |
| Dealers with a phone number | **35** (9%) |
| Dealers with an address in the source | **0** — reverse-geocoded at import |
| Placemarks with a placeholder name | **13** — relabelled (see below) |
| Stock quantities in the source | **none** — everything starts at 0 |

Each placemark carries only a name, an optional free-text `description`, and
`lon,lat` coordinates. Phone numbers are buried in that description in a dozen
different shapes (`9807791022- 500 qty`, `+977 981-9050463`,
`9852056515,9807065215`, `9841178942-ashim Rai`) — `extractPhone()` in
`scripts/kml.ts` pulls them out and the raw text is preserved verbatim in the
`notes` column so nothing is lost.

Dealer names are kept exactly as the source has them (`Karki Suppler`,
`Bhagat Kirana Pasa`). They are real retailer shop names, not `Subidha Gas Dealer -
<city>`; the site is branded Subidha Gas around them.

### Placeholder names

13 placemarks were never actually named — the map author left Google's
auto-generated title (`Point 34`) or pasted coordinates in as the name
(`26.663315, 87.310768`, `26°31'26.1"N 87°06'24.1"E`). Showing those to a customer
is worse than admitting the name is unknown, so they become **"Unnamed dealer"** and
the geocoded locality identifies them instead. The original title is kept in `notes`.

One of them, `Point 34`, shares a coordinate with `Minakshi Rankani Suppliers` and
happens to come first in the file — the import keeps the real name and folds the
placeholder into it rather than the other way round.

### Addresses vs. KML folders

The folders in the export (`Biratnagar`, `ITAHARI`, `East`, `West`, `Mountain`,
`new dealers`…) are the author's own grouping, and **only some name a place** — the
rest are delivery zones. They are therefore never used as `district`: Nominatim is
the only source for that. A dealer filed under the "Biratnagar" folder can genuinely
sit in Itahari, Sunsari, and several do.

After geocoding, the real distribution is Morang 174, Sunsari 147, Saptari 40,
Udayapur 8, Siraha 8, Jhapa 5, Dhankuta 4, Sankhuwasabha 3, Bhojpur 1.

### Import script

```bash
npm run import                     # parse, reverse-geocode uncached points, upsert
npm run import -- --dry-run        # report only, write nothing
npm run import -- --skip-geocode   # no network; coordinates and folder hints only
npm run import -- --no-merge       # keep same-name pins metres apart (yields 405)
```

The script **asserts it parsed exactly 390 dealers** and exits non-zero otherwise,
so a parser regression fails loudly instead of quietly importing a fraction of the
network. Update `EXPECTED_DEALERS` in `scripts/import-kml.ts` deliberately when the
export changes.

Re-running is safe. Rows match on `sourceKey`, which is **derived from coordinates
only, never the name** — an earlier version included the name, and any relabelling
then produced a new key, inserting a duplicate and orphaning the original row along
with its stock history.

What a re-import does to an existing row:

| Field | Behaviour |
| --- | --- |
| `stockQuantity`, `status` | **never touched** — a re-import cannot wipe numbers staff entered |
| `phone` | filled only when blank, so an admin-corrected number survives |
| `address`, `district`, `municipality` | overwritten from Nominatim, which is more authoritative than whatever placeholder is in the row. This is what lets a second run repair districts left by an earlier `--skip-geocode` pass. Use `--skip-geocode` to preserve manual edits. |

### Addresses (reverse geocoding)

The KML has no addresses, so the import reverse-geocodes each coordinate through
**OSM Nominatim** — free, no key. Its usage policy caps anonymous use at 1 req/sec
and requires a contact address in the `User-Agent`, so the first full run takes
about 7 minutes for 391 dealers. Results are cached in `scripts/geocode-cache.json`
(committed) keyed by rounded coordinates, so later runs are instant and offline.
`district` falls back to the KML folder name when Nominatim returns nothing.

### Duplicate merging

15 pairs of identically-named pins sit 2–31 m apart — GPS jitter on one shop, mostly
the KML's `Directions` folder re-listing dealers that already appear in a regional
folder. They are merged (the survivor absorbs any phone the duplicate carried) and
**every merge is printed**, never silent. `--no-merge` keeps them separate.

---

## Stock means "delivered today", and resets at midnight

Nobody reports how many cylinders are left on a dealer's shelf overnight, so a
running inventory would drift into fiction within a day. Instead the number is
**cylinders delivered to that dealer today**:

- Staff enter each dealer's outgoing quantity in the morning.
- Customers see what actually arrived, not a stale cumulative total.
- At **midnight Nepal time every night, every dealer is set back to 0.**

The reset is a Vercel Cron job hitting `/api/cron/reset-stock`, scheduled in
`vercel.json` as `15 18 * * *`. Vercel cron schedules are **UTC**, and Nepal is a
fixed UTC+05:45 with no daylight saving, so 18:15 UTC is midnight in Kathmandu.
`tests/import.test.ts` asserts that the schedule and the timezone still agree, in
both January and July — if someone edits the cron, the test fails.

Before zeroing a dealer, the closing count is written to `StockHistory` as
`N → 0` by "Nightly reset", so the audit trail still shows how many cylinders each
dealer had for the day.

The endpoint accepts two callers and nothing else: Vercel Cron presenting
`Authorization: Bearer $CRON_SECRET`, or a signed-in admin (so staff can trigger it
by hand). To run it manually:

```bash
curl -X POST https://your-domain.com/api/cron/reset-stock \
  -H "Authorization: Bearer $CRON_SECRET"
```

Because of the nightly reset, an all-gray map early in the morning is the **normal**
state, not a fault. Both the public site and the dashboard say so in words rather
than leaving a wall of gray pins to be misread as a broken site.

## Stock thresholds

`src/lib/stock.ts` is the only place a cylinder count is compared to a threshold.
Marker colours, badges, filters, dashboard tiles and the `status` column all derive
from `deriveStatus()`.

| Cylinders | Status | Marker |
| --- | --- | --- |
| more than 50 | `AVAILABLE` | 🟢 green |
| 10 – 50 | `LOW_STOCK` | 🟡 yellow |
| 1 – 9 | `CRITICAL` | 🔴 red |
| 0 | `OUT_OF_STOCK` | ⚫ gray |

The public filter bar offers **All Dealers · Available · Low Stock**, so **Low Stock**
covers both yellow and red — a dealer with 4 cylinders and one with 40 both answer
"who is running low?".

There is no "Out of Stock" filter. A button that lists only dealers with nothing to
sell today serves no customer.

### The public view shows only dealers with stock

Out-of-stock dealers appear **neither as a map pin nor as a card in the side panel**.
A customer wants somewhere to buy gas today, and ~380 entries for dealers with
nothing to sell bury the handful that can actually help. The rule is `hasStock()` in
`src/lib/stock.ts`, applied once in `DealerExplorer` so the map and the list can never
disagree.

They are not lost: the header still reports the full **390-dealer** network, staff see
every dealer in the admin dashboard, and `/api/dealers` returns all of them with their
quantities.

Each pin prints its cylinder count, abbreviated past a thousand (`1450` → `1.4k`), so
the map answers "how many, and where?" without a click.

Consequence worth knowing: because stock resets nightly, **the public view is empty
every morning until deliveries are recorded.** That is expected. The map and the list
each say so in words rather than showing a blank basemap or a blank column.

---

## Maps

OpenStreetMap raster tiles via Leaflet — no Google Maps, no Mapbox, no key, no bill.
The only Google link is the "Directions" button, a plain
`google.com/maps/dir/?api=1` URL that hands off to whatever maps app the user has.

OSM's tile policy is fine at this traffic level. If usage grows, swap the `url` on
the `TileLayer` in `src/components/map/dealer-map.tsx` for a free alternative:

| Provider | URL |
| --- | --- |
| CARTO Voyager | `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` |
| Stadia Alidade Smooth | `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png` (free key) |
| OpenFreeMap | vector tiles, unlimited, no key |

To self-host, serve an `.mbtiles` extract of Nepal (Geofabrik) through
`tileserver-gl` and point the `TileLayer` at it. Attribution must stay either way.

---

## Security

- Credentials auth (Auth.js v5) with bcrypt hashes and JWT sessions, 8-hour expiry.
- `src/middleware.ts` guards `/admin/*`, and **every Server Action re-checks the
  session itself** — middleware is not treated as the authorisation boundary.
- All input validated with Zod on the server; the client shares the same schema for
  fast feedback only.
- Login failures are generic ("Invalid email or password") and compare against a
  dummy hash when the user does not exist, so neither the message nor the timing
  reveals whether an email is registered.
- Rate limiting on login (5 / 10 min per email+IP) and mutations (60 / min per user).
  This is an in-memory limiter — see the ceiling noted in `src/lib/rate-limit.ts`.
- CSV export escapes leading `=`/`+`/`-`/`@` so a dealer name cannot become a
  formula in Excel.
- The nightly reset endpoint requires either `CRON_SECRET` or an admin session, and
  logs a warning if `CRON_SECRET` is unset in production.
- `/admin` and `/api/` are excluded in `robots.ts` and marked `noindex`.

### Known advisory

`npm audit` is clean, but note that Next 15's bundled `postcss` and `sharp` had
advisories fixed only in Next 16. This project pins **Next 15** as specified and
resolves both through `overrides` in `package.json` (`postcss ^8.5.26`,
`sharp ^0.35.3`). Remove the overrides if you upgrade to Next 16.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm test` | Unit tests — KML parsing, phone extraction, thresholds, geo |
| `npm run import` | Import dealers from the KML |
| `npm run seed` | Create/reset the admin account |
| `npm run db:migrate` | Create a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:studio` | Prisma Studio |

Deployment: see [DEPLOYMENT.md](./DEPLOYMENT.md).
