-- Apply once after roles-and-sharing.sql. These tables are server-only.
begin;
create table public.ca_gmail_oauth_states (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state_hash text not null unique,
 expires_at timestamptz not null
);
create table public.ca_gmail_connections (
 id text primary key check (id = 'primary'),
 mailbox text not null,
 refresh_token_encrypted text not null,
 connected_by uuid not null references auth.users(id),
 connected_at timestamptz not null default clock_timestamp()
);
alter table public.ca_gmail_oauth_states enable row level security;
alter table public.ca_gmail_connections enable row level security;
revoke all on public.ca_gmail_oauth_states, public.ca_gmail_connections from public, anon, authenticated;
grant select, insert, update, delete on public.ca_gmail_oauth_states, public.ca_gmail_connections to service_role;
-- No user-facing RLS policies: only the authenticated coordinator Edge Function
-- may access these tables through its server-side service role.
commit;
