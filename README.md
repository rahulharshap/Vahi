# Vahi

Compliance command centre for Indian CA practices.

The bet: CAs already know the deadlines — their staff has them memorised. What
they cannot do is chase 400 clients for documents without it costing them the
relationship. So the product is not a calendar. It is an **automated, escalating
document chaser** with a risk board on top.

## What it does

1. **Client roster** — capture the registration flags once (entity type, GST
   scheme, TDS deductor, employees, tax audit). Nothing else is typed.
2. **Calendar generates itself** — a rules engine derives every statutory
   obligation from those flags and expands it into dated occurrences. 20 rules
   covering GST, income tax, TDS, ROC/MCA and payroll.
3. **Chase pipeline** — at T-10, T-5, T-2, T-1 and past due, a message is
   composed listing exactly which documents are still outstanding, escalating in
   tone and citing the penalty at the last stages.
4. **Risk board** — overdue / critical / at risk / on track, with a rupee
   exposure estimate so work can be ranked by what it costs to miss.
5. **Filing workspace** — document checklist, status, chase history, and an
   extension override for when CBDT or CBIC moves a date.

## Run it

```bash
corepack pnpm install
corepack pnpm dev
```

`pnpm db:seed` loads a demo Hyderabad practice — 26 clients, ~1,700 filings
across a 400-day window, in realistic states of completion.

## Stack

- **Next.js 15** (App Router, server actions — no client-side data layer)
- **Postgres** (Supabase), reached over the transaction pooler. Queries use
  `?` placeholders rewritten to `$n`, and timestamps are generated in JS so one
  operation writes one consistent time across several rows.
- **Tailwind v4** with CSS-variable tokens, light and dark.

## Deploying to Supabase + Vercel

1. Apply the migrations — either paste `supabase/migrations/*.sql` into the
   Supabase SQL editor in order, or:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

2. Set these in Vercel's environment (and in `.env.local` to test locally):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase **pooled** connection string, port 6543 |
   | `SEED_TOKEN` | Any long random string, if you want demo data |

   `DATABASE_URL` is the only one the app needs — it does not use the
   anon/publishable key, because every query is server-side.

3. Seed the demo roster once (optional):

   ```bash
   curl -X POST https://<app>.vercel.app/api/seed -H "x-seed-token: <SEED_TOKEN>"
   ```

`0002_rls.sql` enables row-level security with no policies and revokes the
`anon` and `authenticated` roles. The app connects as the owner and bypasses
RLS, so nothing breaks — but the public key that ships to browsers can read
nothing. That is the correct posture until Supabase Auth is wired up.

## API

A key-authenticated REST surface at `/api/v1`, primarily so the app can be
tested without a browser. See [API.md](API.md).

## Layout

| Path | What lives there |
| --- | --- |
| `src/lib/compliance.ts` | The rules engine. 20 statutory obligations and their date maths. This is the IP. |
| `src/lib/store.ts` | Queries, risk classification, penalty exposure, chase scheduling. |
| `src/lib/whatsapp.ts` | Message composition per escalation stage, and the provider seam. |
| `src/lib/seed.ts` | Demo roster. |
| `src/app/` | Board, calendar, chases, clients, filing detail. |

## Going live — what is deliberately not built

- **WhatsApp delivery.** `dispatch()` in `src/lib/whatsapp.ts` records messages
  locally unless `WA_PROVIDER` is set. Wiring a BSP (AiSensy / Interakt /
  Gupshup) needs an account and template approval, so the adapter is a seam
  rather than a fake HTTP call. Budget 1–2 weeks for template approval.
- **Auth and multi-tenancy.** Every query is scoped by `FIRM_ID`, currently a
  constant, and there is no login. Anyone with the deployed URL sees
  everything. Fine for demo data; not fine for a real firm's client list.
  Wiring Supabase Auth means threading the session's firm id through
  `store.ts` and adding per-firm policies to `0002_rls.sql`.
- **GST portal integration.** Out of scope for v1 on purpose.

## Caveats worth knowing

- Due dates encode the **standard** statutory positions. Extensions are handled
  per-filing via `extended_due`, never by editing the rules.
- Penalty figures are **rank-ordering estimates**, not advice. They exist to
  sort a work queue.
- The compliance rules were written from general knowledge of Indian statutory
  deadlines. Have a practising CA review `src/lib/compliance.ts` line by line
  before this touches a real client.
