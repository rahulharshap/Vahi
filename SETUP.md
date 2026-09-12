# Setting up Vahi from scratch

Everything needed to clone this repo, point it at your own Supabase project,
and deploy it to your own Vercel account. No access to anyone else's
infrastructure is required.

Takes about 15 minutes.

---

## 0. Prerequisites

- **Node 22 or newer.** Check with `node -v`.
- **pnpm.** `corepack enable` gets it, or `npm i -g pnpm`.
- A **Supabase** account (free tier is fine) and a **Vercel** account.

```bash
git clone https://github.com/rahulharshap/Vahi.git
cd Vahi
corepack pnpm install
```

---

## 1. What you will need a database for

Vahi talks to Postgres and nothing else. There is no embedded fallback: a
second driver meant a second schema kept in step by hand, and two schemas
drift. Creating a Supabase project takes about three minutes and the next
steps walk through it.

The test suite needs no database and no network — it runs against PGlite,
which is Postgres compiled to WASM:

```bash
corepack pnpm test
```

---

## 2. Create a Supabase project

1. https://supabase.com/dashboard → **New project**.
2. Pick a region close to your users. India → **Mumbai (ap-south-1)**.
3. Set a database password. **Use letters and digits only** — a password
   containing `@ : / # ? %` has to be percent-encoded inside the connection
   URL and is a common source of "password authentication failed".
4. Save that password somewhere safe. Supabase will not show it again.

---

## 3. Get the connection string

In the dashboard, press **Connect** (top of the page) → **Connection string**
→ **Transaction pooler**.

You want the string that:

- starts with `postgresql://`
- ends with `:6543/postgres`
- has a username shaped like `postgres.<your-project-ref>`

**Use the pooler, not the direct connection.** The direct connection
(`db.<ref>.supabase.co:5432`) opens one Postgres connection per client. On
Vercel that exhausts the connection limit almost immediately, because every
serverless invocation opens its own. Newer Supabase projects also serve direct
connections over IPv6 only, which fails from many networks.

---

## 4. Create `.env.local`

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```ini
# Transaction pooler string from step 3, with your real password
# substituted for [YOUR-PASSWORD]. No angle brackets, no square brackets.
DATABASE_URL=postgresql://postgres.abcdefgh:YourPassword123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

# Any long random string. Enables POST /api/seed.
# Generate one: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
SEED_TOKEN=replace-me
```

`.env.local` is gitignored. Never commit it.

Two mistakes that account for most failures here:

- **Leaving the placeholder brackets in.** `[YOUR-PASSWORD]` and
  `<YOUR-PASSWORD>` are markers. The password goes in bare, between the `:`
  and the `@`.
- **An unencoded special character.** `@` must be written `%40`, `#` must be
  `%23`. Simplest fix is an alphanumeric password.

---

## 5. Create the schema

```bash
corepack pnpm db:migrate
```

This applies `supabase/migrations/*.sql` in order and prints the tables it
created. Expected output:

```
connected: PostgreSQL 17.x ...
  applying 0001_init.sql ... ok
  applying 0002_rls.sql ... ok

tables now in public:
  clients    16 cols  RLS=true
  filings    18 cols  RLS=true
  firms       4 cols  RLS=true
  messages    9 cols  RLS=true
```

The migrations are re-runnable, so this is safe to repeat.

If you would rather not run anything, paste the two files from
`supabase/migrations/` into the Supabase **SQL Editor** and run them in order.
Same result.

---

## 6. Seed the demo data

In one terminal:

```bash
corepack pnpm dev
```

In another:

```bash
corepack pnpm db:seed
```

Takes about 15 seconds and writes ~1,700 filings. It wipes and rewrites the
tables each time, so it is safe to re-run but will discard any real data.

Open http://localhost:3000 — you should now be looking at data served from
Supabase rather than SQLite. The board header shows the client count.

---

## 7. Deploy to Vercel

```bash
vercel login
vercel link
```

Or import the GitHub repo from the Vercel dashboard, which is easier.

Then set **two** environment variables in Vercel → Project → Settings →
Environment Variables:

| Variable | Value | Environments |
| --- | --- | --- |
| `DATABASE_URL` | the same pooler string from step 3 | Production, Preview, Development |
| `SEED_TOKEN` | the same random string | Production |

That is the complete list. The app does not use the Supabase publishable or
secret keys — every query is server-side over the Postgres wire protocol, so
the connection string is the only credential involved.

Deploy:

```bash
vercel --prod
```

### Put the functions in the same region as the database

`vercel.json` pins `regions: ["bom1"]` (Mumbai). This matters more than any
code change in this repo.

Vercel defaults functions to `iad1` (Washington DC). With a Supabase project
in Mumbai, every query then makes a transatlantic round trip. Measured inside
the deployed function:

| | iad1 (default) | bom1 (pinned) |
| --- | --- | --- |
| `SELECT 1` | 185 ms | 1 ms |
| `dashboard()` | 2240 ms | 29 ms |
| Page load | ~3 s | 0.42 s |

If you host the database somewhere else, change `bom1` to match it. On the
Hobby plan `vercel.json` may be ignored — check `/api/diag`, and if `region`
is not what you expect, set it in Settings → Functions → Function Region.

Note that `X-Vercel-Id` on a response shows the *edge* location, not where
the function ran. Only `/api/diag` tells you the truth.

Seed the deployed instance once, if you want the demo data there too:

```bash
SEED_URL=https://your-app.vercel.app corepack pnpm db:seed
```

---

## 8. Confirm it works

```bash
corepack pnpm test
```

Runs 17 checks against real Postgres (PGlite — Postgres compiled to WASM), so
it needs no credentials and no network. It covers both migrations, the column
types, RLS being enabled, the unique constraint that makes calendar sync
idempotent, the check constraints, the board's ordering query, and cascade
deletes.

```bash
corepack pnpm build
```

Should compile with no type errors.

---

## Troubleshooting

**`password authentication failed for user "postgres"`**
The password in `DATABASE_URL` is wrong, still has placeholder brackets around
it, or contains an unencoded special character. See step 4.

**`getaddrinfo ENOTFOUND` or a connection that hangs**
Usually the direct connection string on an IPv6-only project. Switch to the
transaction pooler (step 3).

**`relation "clients" does not exist`**
Migrations have not been applied. Run `pnpm db:migrate`.

**The app shows an empty board**
Schema exists but no data. Run `pnpm db:seed` with the dev server running.

**Works locally, fails on Vercel**
Check that `DATABASE_URL` is set for the Production environment specifically,
and that it is the pooler string. A direct connection will often work locally
and fail under serverless.

**Seeding times out on Vercel**
The route sets `maxDuration = 60`, which the Hobby plan allows. If it still
times out, seed from your machine against the deployed URL instead — the
`SEED_URL=` form in step 7.

---

## What is deliberately not built

- **Authentication.** There is none. `FIRM_ID` is a constant in
  `src/lib/store.ts` and anyone with the URL sees everything. Fine for a demo;
  not fine for a real firm's client list. `0002_rls.sql` enables row-level
  security with no policies and revokes the `anon` and `authenticated` roles,
  so the database is not exposed through Supabase's HTTP API — but the app
  itself has no login.
- **WhatsApp delivery.** Chase messages are composed and recorded, not sent,
  unless `WA_PROVIDER` is set and an adapter is written in
  `src/lib/whatsapp.ts`. Sending needs a Business Solution Provider account
  (AiSensy, Interakt, Gupshup) and approved message templates — allow 1–2
  weeks for template approval.
- **GST portal integration.** Out of scope for v1.

## One thing to have checked

The statutory due dates in `src/lib/compliance.ts` were written from general
knowledge of Indian compliance deadlines. Have a practising CA read that file
before it touches a real client. That file being correct is the entire product.
