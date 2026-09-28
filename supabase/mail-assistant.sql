begin;
create table public.ca_mail_messages (
 id text primary key,
 thread_id text not null,
 subject text not null,
 sender text not null,
 sent_at timestamptz not null,
 direction text not null check(direction in ('reçu','envoyé')),
 body text not null,
 truncated boolean not null default false,
 analysis jsonb,
 analyzed_at timestamptz,
 imported_at timestamptz not null default clock_timestamp()
);
create index ca_mail_messages_date_idx on public.ca_mail_messages(sent_at desc);
create index ca_mail_messages_thread_idx on public.ca_mail_messages(thread_id,sent_at);
create index ca_mail_messages_pending_idx on public.ca_mail_messages(sent_at desc) where analysis is null;
alter table public.ca_mail_messages enable row level security;
revoke all on public.ca_mail_messages from public,anon,authenticated;
grant select on public.ca_mail_messages to authenticated;
grant all on public.ca_mail_messages to service_role;
create policy "Coordinateur consulte Gmail privé" on public.ca_mail_messages for select to authenticated
 using (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
alter table public.ca_gmail_connections
 add column sync_page_token text,
 add column sync_since bigint,
 add column sync_started bigint,
 add column last_sync timestamptz,
 add column lock_until timestamptz not null default 'epoch',
 add column lock_owner uuid;
create table public.ca_mail_ai_usage(day date primary key, attempts integer not null default 0 check(attempts>=0));
alter table public.ca_mail_ai_usage enable row level security;
revoke all on public.ca_mail_ai_usage from public,anon,authenticated;
grant all on public.ca_mail_ai_usage to service_role;
commit;
