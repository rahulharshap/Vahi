-- Who may see a firm's data.
--
-- Authentication is Supabase Auth: users live in auth.users, and password
-- hashing, email verification and reset flows are its problem rather than
-- ours. This table is the missing half — which firm a user belongs to, and
-- what they may do there.
--
-- A user can belong to several firms. That is not speculative: an accountant
-- who does contract work for two practices is ordinary, and discovering it
-- after modelling one-firm-per-user is an expensive migration.

create table if not exists memberships (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  firm_id    text not null references firms(id) on delete cascade,
  role       text not null default 'staff',
  -- the display name shown on filings this person owns
  full_name  text,
  created_at timestamptz not null default now(),
  unique (user_id, firm_id),
  constraint memberships_role_check check (role in ('owner', 'admin', 'staff'))
);

create index if not exists idx_memberships_user on memberships(user_id);
create index if not exists idx_memberships_firm on memberships(firm_id);

alter table memberships enable row level security;

-- A signed-in user may read their own memberships and nothing else. The app
-- itself connects as the owner role and bypasses RLS; this policy exists so
-- that the browser-side key, which ships to every visitor, cannot enumerate
-- who works where.
drop policy if exists memberships_self_read on memberships;
create policy memberships_self_read on memberships
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on memberships from anon;

-- ------------------------------------------------------------ invitations

-- Onboarding a colleague without handing round a shared password. An invite
-- is claimed once, by whoever signs up with that email.
create table if not exists invitations (
  id         text primary key,
  firm_id    text not null references firms(id) on delete cascade,
  email      text not null,
  role       text not null default 'staff',
  invited_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_role_check check (role in ('owner', 'admin', 'staff'))
);

create unique index if not exists idx_invitations_open
  on invitations(firm_id, lower(email)) where claimed_at is null;
create index if not exists idx_invitations_email on invitations(lower(email));

alter table invitations enable row level security;
revoke all on invitations from anon;
revoke all on invitations from authenticated;
