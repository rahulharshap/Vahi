-- Lock the tables down before anything real goes in them.
--
-- The app talks to Postgres over DATABASE_URL as the owner role, which bypasses
-- RLS. Enabling RLS with NO policies therefore changes nothing for the app but
-- means the public anon/publishable key can read nothing at all — which matters
-- because that key ships to the browser.
--
-- When Supabase Auth lands, add per-firm policies here keyed on the user's
-- firm_id claim. Until then, deny-by-default is the correct posture: this data
-- is a CA firm's entire client list.

alter table firms    enable row level security;
alter table clients  enable row level security;
alter table filings  enable row level security;
alter table messages enable row level security;

-- Belt and braces: revoke the API roles explicitly rather than relying on RLS
-- alone, so a future policy added by mistake cannot silently open these up.
revoke all on firms, clients, filings, messages from anon;
revoke all on firms, clients, filings, messages from authenticated;
