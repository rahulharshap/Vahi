-- Multi-tenancy, per-firm configuration, and an auditable API surface.
--
-- Until now FIRM_ID was a constant in the code: one tenant, decided at compile
-- time. Everything here exists to make a firm a row rather than a literal.
--
-- Note what deliberately does NOT become per-firm: the statutory rules. GSTR-3B
-- is due on the 20th for every firm in India, and letting a tenant edit that
-- would turn a correctness guarantee into a support ticket. Rules stay in code,
-- shared by all tenants. What varies per firm is how they talk to their
-- clients — wording, sender identity, channel — and that is what these tables
-- carry.

-- ---------------------------------------------------------------- firms

alter table firms add column if not exists slug text;
alter table firms add column if not exists timezone text not null default 'Asia/Kolkata';
alter table firms add column if not exists active boolean not null default true;

update firms set slug = 'demo' where slug is null;

create unique index if not exists idx_firms_slug on firms(slug);

-- --------------------------------------------------------- firm settings

-- One row per firm. Everything a firm configures about how Vahi speaks on
-- their behalf. Secrets are referenced by environment-variable name rather
-- than stored: a provider token in a database row is a token in every backup.
create table if not exists firm_settings (
  firm_id             text primary key references firms(id) on delete cascade,

  -- outbound identity
  sender_name         text,
  reply_to_email      text,
  wa_business_number  text,
  wa_provider         text,
  email_provider      text,
  -- names of env vars holding the provider credentials, never the values
  wa_credential_ref   text,
  email_credential_ref text,

  -- inbound
  intake_domain       text,

  -- behaviour
  chase_enabled       boolean not null default true,
  chase_send_hour     integer not null default 9,
  chase_lookback_days integer not null default 45,
  default_channel     text not null default 'WHATSAPP',

  updated_at          timestamptz not null default now(),

  constraint firm_settings_channel_check check (default_channel in ('WHATSAPP', 'EMAIL', 'BOTH')),
  constraint firm_settings_hour_check check (chase_send_hour between 0 and 23)
);

-- ------------------------------------------------------------ templates

-- Message wording per firm, per channel, per escalation stage. A row that does
-- not exist falls back to the built-in default in src/lib/templates.ts, so a
-- new firm works immediately and only overrides what it wants to change.
create table if not exists message_templates (
  id          text primary key,
  firm_id     text not null references firms(id) on delete cascade,
  channel     text not null,
  stage       text not null,
  subject     text,
  body        text not null,
  updated_at  timestamptz not null default now(),
  unique (firm_id, channel, stage),
  constraint message_templates_channel_check check (channel in ('WHATSAPP', 'EMAIL')),
  constraint message_templates_stage_check check (stage in ('T10', 'T5', 'T2', 'T1', 'OVERDUE'))
);

create index if not exists idx_templates_firm on message_templates(firm_id);

-- ------------------------------------------------------------- api keys

-- Keys are stored as a SHA-256 hash. The plaintext is shown once at creation
-- and never again, so a database leak does not hand over API access.
create table if not exists api_keys (
  id           text primary key,
  firm_id      text not null references firms(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,
  key_hash     text not null unique,
  scopes       text not null default 'read',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  constraint api_keys_scopes_check check (scopes in ('read', 'write', 'admin'))
);

create index if not exists idx_api_keys_firm on api_keys(firm_id);
create index if not exists idx_api_keys_hash on api_keys(key_hash) where revoked_at is null;

-- ------------------------------------------------------------ audit log

-- Who changed what. Compliance software that cannot answer that is not
-- compliance software — a firm needs to show when a filing was marked filed
-- and by whom, months later.
create table if not exists audit_log (
  id         text primary key,
  firm_id    text not null references firms(id) on delete cascade,
  actor      text not null,
  actor_kind text not null default 'USER',
  action     text not null,
  entity     text,
  entity_id  text,
  detail     text,
  created_at timestamptz not null default now(),
  constraint audit_log_actor_kind_check check (actor_kind in ('USER', 'API', 'SYSTEM'))
);

create index if not exists idx_audit_firm_created on audit_log(firm_id, created_at desc);
create index if not exists idx_audit_entity on audit_log(entity, entity_id);

-- ------------------------------------------------------------------ rls

alter table firm_settings    enable row level security;
alter table message_templates enable row level security;
alter table api_keys         enable row level security;
alter table audit_log        enable row level security;

revoke all on firm_settings, message_templates, api_keys, audit_log from anon;
revoke all on firm_settings, message_templates, api_keys, audit_log from authenticated;

-- Seed settings for every existing firm so nothing has to null-check.
insert into firm_settings (firm_id)
select id from firms
on conflict (firm_id) do nothing;
