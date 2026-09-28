begin;
alter table public.ca_mail_messages
 add column reviewed_at timestamptz,
 add column review_source text,
 add column is_newsletter boolean not null default false;
update public.ca_mail_messages set reviewed_at=analyzed_at,review_source='gemini' where analysis is not null;
update public.ca_mail_messages set is_newsletter=true where subject ~* '(newsletter|lettre d.information|\[rdp-ffmc\]|\[infos-reseau\])' or sender ~* '(newsletter@|lettres@information.dila.gouv.fr)';
create table public.ca_news_items(
 id uuid primary key default gen_random_uuid(),
 dedupe_key text not null unique,
 kind text not null check(kind in ('bilan','suivi','veille')),
 topic text not null,
 title text not null,
 body text not null,
 progress text not null default '',
 next_step text not null default '',
 status text not null default 'À suivre' check(status in ('À suivre','À discuter','En cours','Clos')),
 source_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(source_refs)='array'),
 published_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated timestamptz not null default now()
);
alter table public.ca_news_items enable row level security;
revoke all on public.ca_news_items from public,anon,authenticated;
grant select,insert,update on public.ca_news_items to authenticated;
grant all on public.ca_news_items to service_role;
create policy "Coordinateur consulte actualités" on public.ca_news_items for select to authenticated using(exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create policy "Coordinateur ajoute actualités" on public.ca_news_items for insert to authenticated with check(exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create policy "Coordinateur suit actualités" on public.ca_news_items for update to authenticated using(exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur')) with check(exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create index ca_news_date_idx on public.ca_news_items(published_at desc);
create index ca_mail_review_pending_idx on public.ca_mail_messages(sent_at desc) where analysis is null and reviewed_at is null;
commit;
