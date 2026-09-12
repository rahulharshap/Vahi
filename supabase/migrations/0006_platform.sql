-- The platform tier, above firms.
--
-- Three levels of authority now exist and they are deliberately distinct:
--
--   platform admin  — operates Vahi. Creates firms, sets their limits.
--   firm owner      — runs one practice. Invites staff, edits templates.
--   staff           — does the work.
--
-- A firm owner must never be able to reach another firm's data, and a platform
-- admin must be a separate decision from being an owner — otherwise the first
-- customer's owner account would carry the keys to every other customer.

create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
revoke all on platform_admins from anon;
revoke all on platform_admins from authenticated;

-- ------------------------------------------------------------- seat limits

-- How many people may belong to a firm. Null means no limit, which is the
-- right default for an existing deployment: adding a limit should never
-- retroactively lock people out of a firm they already belong to.
alter table firm_settings add column if not exists max_members integer;

do $$ begin
  alter table firm_settings add constraint firm_settings_max_members_check
    check (max_members is null or max_members > 0);
exception when duplicate_object then null;
end $$;

-- A note on where this is enforced: in the application, at two points — when
-- an invitation is created and again when a membership is created. Both,
-- because an invitation issued while a seat was free could otherwise be
-- claimed after the last one went, and the check at claim time is the only one
-- that is actually authoritative.
