-- Vahi initial schema (Postgres / Supabase).
--
-- Kept in step with SQLITE_SCHEMA in src/lib/db.ts, which the app uses locally
-- when DATABASE_URL is unset. Both speak the same SQL subset: `?` placeholders
-- (rewritten to $n for Postgres) and timestamps generated in JS, so no
-- dialect-specific default functions appear in application queries.

create table if not exists firms (
  id          text primary key,
  name        text not null,
  city        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists clients (
  id             text primary key,
  firm_id        text not null references firms(id) on delete cascade,
  name           text not null,
  entity_type    text not null,
  pan            text,
  gstin          text,
  gst_scheme     text not null default 'NONE',
  tds_deductor   boolean not null default false,
  has_employees  boolean not null default false,
  tax_audit      boolean not null default false,
  director_count integer not null default 0,
  state          text not null default 'Telangana',
  contact_name   text,
  contact_phone  text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint clients_entity_type_check check (entity_type in
    ('INDIVIDUAL','PROPRIETOR','PARTNERSHIP','LLP','PVT_LTD','TRUST')),
  constraint clients_gst_scheme_check check (gst_scheme in
    ('NONE','MONTHLY','QRMP','COMPOSITION'))
);
create index if not exists idx_clients_firm on clients(firm_id);

-- One row per (client, obligation, period). Regenerated idempotently from the
-- rules engine in src/lib/compliance.ts.
create table if not exists filings (
  id              text primary key,
  client_id       text not null references clients(id) on delete cascade,
  obligation_code text not null,
  title           text not null,
  category        text not null,
  authority       text not null,
  period_key      text not null,
  period_label    text not null,
  due_date        date not null,
  -- set when CBDT/CBIC extends a deadline; overrides due_date everywhere
  extended_due    date,
  status          text not null default 'AWAITING_DOCS',
  docs_required   text not null default '[]',
  docs_received   text not null default '[]',
  penalty_note    text,
  assignee        text,
  filed_at        timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (client_id, obligation_code, period_key),
  constraint filings_status_check check (status in
    ('AWAITING_DOCS','DOCS_RECEIVED','IN_PROGRESS','FILED','NOT_APPLICABLE')),
  constraint filings_category_check check (category in
    ('GST','INCOME_TAX','TDS','ROC','PAYROLL'))
);
create index if not exists idx_filings_due on filings(due_date);
create index if not exists idx_filings_client on filings(client_id);
create index if not exists idx_filings_status on filings(status);
-- the board and calendar both order on the effective date
create index if not exists idx_filings_effective_due on filings(coalesce(extended_due, due_date));

-- Every chase sent to a client.
create table if not exists messages (
  id         text primary key,
  filing_id  text not null references filings(id) on delete cascade,
  client_id  text not null references clients(id) on delete cascade,
  stage      text not null,
  channel    text not null default 'WHATSAPP',
  body       text not null,
  status     text not null default 'QUEUED',
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_stage_check check (stage in ('T10','T5','T2','T1','OVERDUE'))
);
create index if not exists idx_messages_filing on messages(filing_id);
create index if not exists idx_messages_client_created on messages(client_id, created_at desc);
