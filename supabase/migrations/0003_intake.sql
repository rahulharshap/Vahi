-- Document intake.
--
-- Clients send documents by email, by WhatsApp, or both — it varies per client
-- and the firm does not get to choose. So the channel is a property of the
-- client, and everything downstream of arrival is channel-agnostic: a document
-- that came from an email attachment and one that came from a WhatsApp media
-- message land in the same table and are matched by the same cascade.

alter table clients add column if not exists email text;
alter table clients add column if not exists channel text not null default 'WHATSAPP';

do $$ begin
  alter table clients add constraint clients_channel_check
    check (channel in ('WHATSAPP', 'EMAIL', 'BOTH'));
exception when duplicate_object then null;
end $$;

-- One row per file that arrives. filing_id is null while a document is
-- unmatched, which is the whole point of keeping them in a table rather than
-- only ticking a checkbox: an unmatched document is visible and triageable,
-- whereas a misfiled one is invisible and worse.
create table if not exists documents (
  id            text primary key,
  firm_id       text not null references firms(id) on delete cascade,
  filing_id     text references filings(id) on delete set null,
  client_id     text references clients(id) on delete set null,
  doc_label     text,
  file_name     text not null,
  content_type  text,
  size_bytes    integer,
  storage_path  text,
  source        text not null default 'EMAIL',
  from_address  text,
  subject       text,
  matched_by    text,
  received_at   timestamptz not null default now(),
  constraint documents_source_check check (source in ('EMAIL', 'WHATSAPP', 'UPLOAD')),
  constraint documents_matched_by_check check (
    matched_by is null or matched_by in ('TOKEN', 'SENDER', 'FILENAME', 'MANUAL')
  )
);

create index if not exists idx_documents_filing on documents(filing_id);
create index if not exists idx_documents_firm_received on documents(firm_id, received_at desc);
-- the unmatched tray is the screen someone works through every morning
create index if not exists idx_documents_unmatched on documents(firm_id) where filing_id is null;

alter table documents enable row level security;
revoke all on documents from anon;
revoke all on documents from authenticated;
