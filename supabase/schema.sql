-- À exécuter une fois dans l’éditeur SQL d’un NOUVEAU projet Supabase.
-- Les membres sont gérés exclusivement par un administrateur Supabase.
begin;
create table public.ca_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default ''
);
alter table public.ca_members enable row level security;
revoke all on public.ca_members from anon, authenticated;
grant select on public.ca_members to authenticated;
create policy "Voir sa propre autorisation" on public.ca_members
 for select to authenticated using (user_id = (select auth.uid()));

create table public.records (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('Dossier','Réunion','Mail')),
 title text not null check (char_length(trim(title)) between 1 and 200),
 status text not null check (status in ('À réfléchir','À décider','En cours','Terminé','À trier','À partager','Archivé')),
 owner text not null default '' check (char_length(owner)<=200),
 due date,
 notes text not null default '' check (char_length(notes)<=30000),
 next text not null default '' check (char_length(next)<=30000),
 created_by uuid default auth.uid(),
 updated timestamptz not null default clock_timestamp(),
 constraint valid_kind_status check (
   (kind='Mail' and status in ('À trier','À partager','Archivé')) or
   (kind in ('Dossier','Réunion') and status in ('À réfléchir','À décider','En cours','Terminé'))
 )
);
create index records_updated_idx on public.records(updated desc);
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;
grant select on public.records to authenticated;
grant insert(kind,title,status,owner,due,notes,next) on public.records to authenticated;
grant update(kind,title,status,owner,due,notes,next) on public.records to authenticated;
create policy "Lire les dossiers du CA" on public.records
 for select to authenticated using (exists(select 1 from public.ca_members where user_id=(select auth.uid())));
create policy "Créer un dossier du CA" on public.records
 for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.ca_members where user_id=(select auth.uid())));
create policy "Modifier un dossier du CA" on public.records
 for update to authenticated using (exists(select 1 from public.ca_members where user_id=(select auth.uid())))
 with check (exists(select 1 from public.ca_members where user_id=(select auth.uid())));
create function public.record_updated() returns trigger language plpgsql set search_path='' as $$
begin new.updated=clock_timestamp(); return new; end;
$$;
create trigger record_updated before update on public.records for each row execute function public.record_updated();
commit;
