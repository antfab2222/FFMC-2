-- Mise à niveau à appliquer une seule fois après schema.sql.
begin;
alter table public.ca_members add column role text not null default 'membre' check (role in ('membre','coordinateur'));

drop policy "Lire les dossiers du CA" on public.records;
drop policy "Créer un dossier du CA" on public.records;
drop policy "Modifier un dossier du CA" on public.records;
create policy "Coordinateur lit les informations privées" on public.records for select to authenticated
 using (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create policy "Coordinateur crée les informations privées" on public.records for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create policy "Coordinateur modifie les informations privées" on public.records for update to authenticated
 using (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'))
 with check (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));

-- Une publication contient uniquement le texte explicitement validé pour le CA.
-- Les notes et les réponses privées du dossier source ne sont jamais jointes.
create table public.ca_publications (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 1 and 200),
 body text not null check (char_length(trim(body)) between 1 and 30000),
 published boolean not null default true,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default clock_timestamp(),
 updated timestamptz not null default clock_timestamp()
);
create index ca_publications_created_at_idx on public.ca_publications(created_at desc);
alter table public.ca_publications enable row level security;
revoke all on public.ca_publications from anon, authenticated;
grant select on public.ca_publications to authenticated;
grant insert(title,body,published) on public.ca_publications to authenticated;
grant update(title,body,published) on public.ca_publications to authenticated;
create policy "CA lit les publications partagées" on public.ca_publications for select to authenticated
 using (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and (role='coordinateur' or published)));
create policy "Coordinateur publie" on public.ca_publications for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create policy "Coordinateur gère le partage" on public.ca_publications for update to authenticated
 using (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'))
 with check (exists(select 1 from public.ca_members where user_id=(select auth.uid()) and role='coordinateur'));
create trigger publication_updated before update on public.ca_publications for each row execute function public.record_updated();
commit;
