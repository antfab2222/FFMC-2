-- Apply after news-and-review.sql and news-mail-updates.sql.
begin;
alter table public.ca_news_items
 add column news_scope text not null default 'France' check(news_scope in ('Europe','France','Région Sud','Alpes-Maritimes')),
 add column news_type text not null default 'Information' check(news_type in ('Décision officielle','Projet en débat','Position associative','Événement','Étude et chiffres','Information')),
 add column importance text not null default 'À suivre' check(importance in ('À la une','Important','À suivre')),
 add column impact text not null default '',
 add column event_date date,
 add column verified_at timestamptz;
create index ca_news_feed_idx on public.ca_news_items(news_scope,published_at desc) where kind='veille';
create table public.ca_news_watch(
 id text primary key check(id='primary'),
 last_checked_at timestamptz,
 last_success_at timestamptz,
 status text not null default 'pending' check(status in ('pending','ok','partial','error')),
 message text not null default '',
 source_refs jsonb not null default '[]' check(jsonb_typeof(source_refs)='array')
);
alter table public.ca_news_watch enable row level security;
revoke all on public.ca_news_watch from public,anon,authenticated;
grant select on public.ca_news_watch to authenticated;
grant all on public.ca_news_watch to service_role;
create policy "Coordinateur consulte la veille" on public.ca_news_watch for select to authenticated
 using(exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
insert into public.ca_news_watch(id) values('primary');
commit;
