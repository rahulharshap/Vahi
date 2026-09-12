# Vahi

Compliance command centre for Indian CA practices.

**The bet:** a CA firm already knows every statutory deadline — their staff have
them memorised. What costs them their evenings is chasing hundreds of clients
for documents, month after month, without straining the relationship. So this
is not a calendar. It is an **automated, escalating document chaser** with a
risk board on top.

The message goes out from *the system*, not from the partner. That is the
unlock: nobody feels nagged by a person they have a relationship with, and the
firm stops absorbing the awkwardness.

---

## Status, honestly

**Working:** the rules engine, every screen, document matching, multi-tenancy,
authentication, the API, logging and the audit trail. Deployed on Vercel
against Supabase, with 127 automated checks plus a membership harness.

**Not working yet, and deliberately so:**

| | |
| --- | --- |
| **Sending** — WhatsApp or email | Messages are composed and recorded, not delivered. No provider account exists. |
| **Receiving** — inbound email | The endpoint works and is tested, but there is no MX record, so nothing arrives. |
| **File storage** | Document metadata is recorded; the bytes are not kept. |
| **MCA / GST portal integration** | Out of scope. |

Those are seams, not stubs: `deliver()` throws if a provider is configured but
no adapter is written, rather than pretending to send. A chase that silently
goes nowhere is worse than one that visibly fails, because the firm would
believe the client had been asked.

---

## Quick start

```bash
corepack pnpm install
cp .env.example .env.local          # then add DATABASE_URL
corepack pnpm db:migrate            # applies supabase/migrations in order
corepack pnpm dev                   # in one terminal
corepack pnpm db:seed               # in another
```

You need a Postgres database — Supabase's free tier is fine, and
[SETUP.md](SETUP.md) walks through creating one from scratch, including the
traps that cost real time (transaction pooler vs direct connection, password
encoding, function region).

The seed loads a demo Hyderabad practice: 26 clients, ~1,700 filings across a
400-day window, in realistic states of completion.

---

## The four ideas

Understand these and the codebase follows.

### 1. A filing is `(client, obligation, period)`

`UNIQUE (client_id, obligation_code, period_key)`. GSTR-3B for Aug 2026 for one
client is exactly one row and can only ever be one row.

That constraint carries more weight than it looks: it is what makes calendar
regeneration idempotent, and it is what a document attaches to when a client
replies.

### 2. The calendar generates itself

You describe a client once — entity type, GST scheme, whether they deduct TDS,
have employees, are a tax-audit case. Five flags. No dates are ever typed.

[`src/lib/compliance.ts`](src/lib/compliance.ts) turns those into every
statutory obligation that applies and expands each into dated occurrences. A
private limited company with everything on generates 86 filings a year; a
salaried individual generates one.

This file is the product. Everything else is CRUD around it. It has 52 tests
of its own, asserting real statutory dates — GSTR-1 on the 11th, GSTR-3B on the
20th, TDS deposit on the 7th, tax audit 30 Sep, AOC-4 30 Oct, and so on.

Browse it in the app at **/rules**, which reads the same array the engine uses.

### 3. Chases escalate, and stop

At T-10, T-5, T-2, T-1 and past due, a message is composed naming exactly which
documents are still outstanding, escalating in tone and citing the statutory
penalty at the last stages. A stage is never repeated, and chasing stops 45 days
past due — older than that is a partner's phone call, not a template.

Wording lives in `message_templates` per firm, per channel, per stage, editable
at **/settings/templates**, falling back to the defaults in
[`src/lib/templates.ts`](src/lib/templates.ts).

### 4. Documents route themselves, or go to a tray

When a client replies, [`src/lib/intake.ts`](src/lib/intake.ts) works out which
filing the file belongs to, cheapest and surest first:

1. **TOKEN** — every chase email carries a signed reply address naming the
   filing. Exact.
2. **SENDER** — the address identifies a client with exactly one filing
   awaiting documents. Unambiguous by elimination.
3. **FILENAME** — word overlap against that filing's document list.
4. **Unmatched** — everything else lands at **/inbox** for one-tap triage.

There is no model in that cascade. A wrong guess files a bank statement against
the wrong return, silently; an unmatched document is visible, which makes it the
better failure.

---

## Tenancy

Three levels of authority, deliberately distinct:

| | Configures |
| --- | --- |
| **Platform admin** | creates firms, sets seat limits, suspends them — at `/admin` |
| **Firm owner** | their practice: templates, WhatsApp number, channel, staff |
| **Staff** | the work itself |

`currentFirmId()` resolves per request — from an API key on the API, from the
signed-in user's membership in the browser — and `AsyncLocalStorage` carries it
through the whole call tree. A handler has no way to *name* a firm, so it
cannot accidentally read another tenant's rows.

**What is not per-tenant: the statutory rules.** GSTR-3B is due on the 20th for
every firm in India. Letting a tenant edit that would turn a correctness
guarantee into a support ticket. Firms configure how they speak to clients, not
when the government wants the return.

Authentication is Supabase Auth — password hashing, verification and reset are
its problem. Memberships, roles and seats are ours. The first account created on
a fresh deployment becomes the firm's owner; that door shuts the moment one
membership exists.

---

## Codebase map

| Path | What lives there |
| --- | --- |
| `src/lib/compliance.ts` | **The rules engine.** 20 obligations and their date maths. |
| `src/lib/store.ts` | Queries, risk classification, exposure, chase scheduling. |
| `src/lib/intake.ts` | Reply tokens and the document matching cascade. |
| `src/lib/templates.ts` | Default message wording and `{{variable}}` rendering. |
| `src/lib/messages.ts` | Composing a chase from a firm's templates. |
| `src/lib/notify.ts` | Channel routing, and the provider seam. |
| `src/lib/tenant.ts` | Firms, settings, API keys, request scope. |
| `src/lib/auth.ts` | Sessions, memberships, invitations, seat limits. |
| `src/lib/log.ts` | Structured logs and the audit trail. |
| `src/lib/redact.ts` | Credential scrubbing. Pure, so it is directly testable. |
| `src/lib/db.ts` | Postgres access, batched writes. |
| `src/app/(app)/` | The firm-facing app. |
| `src/app/admin/` | The platform console. |
| `src/app/api/v1/` | The REST API — see [API.md](API.md). |
| `supabase/migrations/` | Schema, applied in order. |

---

## Testing

```bash
corepack pnpm test              # 127 checks, no database or network needed
corepack pnpm verify:membership # needs a database; writes and cleans up
```

Four suites, 127 checks, none of which need infrastructure:

- **compliance** (52) — statutory dates, applicability, invariants
- **intake** (27) — tokens, filename matching, the cascade
- **api** (18) — credential redaction, pagination limits
- **postgres** (30) — migrations and constraints, against PGlite, which is real
  Postgres compiled to WASM

`verify:membership` adds 12 more, covering what a constraint cannot: who ends
up in which firm. Bootstrap ownership, invitation claiming, seat limits, and
tenant isolation — 139 in total.

---

## Environment

`.env.example` documents every variable. The essentials:

| Variable | |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler** string, port 6543. The only secret the app needs. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enable authentication. Both public. Leave unset and the app runs as a single open tenant. |
| `PLATFORM_ADMIN_EMAILS` | Who may reach `/admin`. |
| `INTAKE_DOMAIN`, `INTAKE_SECRET`, `INBOUND_TOKEN` | Document intake. |
| `WA_PROVIDER`, `EMAIL_PROVIDER` | Leave unset until an adapter exists. |

Two things that will bite you, both learned the hard way:

- **`NEXT_PUBLIC_*` variables are inlined at build time.** Changing one needs a
  redeploy *without* build cache, or the old value silently survives — and an
  app you believe is authenticated stays open.
- **Function region must match the database region.** `vercel.json` pins
  `bom1`. With functions in `iad1` and Supabase in Mumbai, `SELECT 1` took
  185 ms and the board 2.2 s. Co-locating them made it 1 ms and 29 ms.

---

## Decisions worth knowing

**Postgres only, no embedded fallback.** There was a SQLite path for local
development. It meant a second schema kept in step by hand, and two schemas
drift. Tests lose nothing — they run against PGlite.

**No AI anywhere.** Deadlines, penalties, risk and routing are all
deterministic. A CA cannot have "the model thought GSTR-3B was due on the 22nd";
the output has to be defensible to a client and a tax officer. If a model is
ever added it belongs at the ragged edge — classifying an unlabelled photo —
suggesting, never deciding.

**Provider credentials are never stored.** A firm records the *name* of the
environment variable holding its token. A token in a database row is a token in
every backup.

**Extensions are data, not code.** CBDT and CBIC move dates constantly.
`extended_due` overrides the statutory date everywhere, including the chase
schedule, without touching the rules.

---

## Before this touches a real client

The statutory rules were written from general knowledge of Indian compliance
deadlines and are covered by tests that assert what we believe to be true.
**Have a practising CA read `src/lib/compliance.ts` line by line.** That file
being correct is the entire product; the tests only prove it does what it was
told.

Penalty figures are rank-ordering estimates, not advice. They exist to sort a
work queue, and are labelled as estimates wherever they appear.

And there is no login until `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Unconfigured, the app is a single open
tenant — fine for a demo with sample data, not fine for a real client list. Both
`/login` and Settings say so on screen rather than pretending otherwise.
