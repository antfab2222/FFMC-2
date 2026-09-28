-- Synthetic fixtures only; never publish private mail contents.
begin;
insert into public.ca_mail_messages(id,thread_id,subject,sender,sent_at,direction,body) values
('000000000000bb01','000000000000bb01','[infos-reseau] Ordre du jour du BN','reseau@example.invalid',now(),'reçu','Voir document joint'),
('000000000000bb02','000000000000bb02','Assises - Compte rendu','reseau@example.invalid',now(),'reçu','Voir document joint'),
('000000000000bb03','000000000000bb03','[rdp-ffmc] Actualités du réseau','reseau@example.invalid',now(),'reçu','Revue de presse'),
('000000000000bb04','000000000000bb04','Nouvelle notification','test@instagram.com',now(),'reçu','Aucun sujet moto'),
('000000000000bb05','000000000000bb05','Sujet ambigu','reseau@example.invalid',now(),'reçu','Information');
do $$ begin
 if (select mail_category from public.ca_mail_messages where id='000000000000bb01')<>'Ordres du jour' then raise exception 'Agenda filing'; end if;
 if (select mail_topic from public.ca_mail_messages where id='000000000000bb01')<>'Réunions et CA' then raise exception 'Agenda topic'; end if;
 if (select mail_category from public.ca_mail_messages where id='000000000000bb02')<>'Comptes rendus' then raise exception 'Minutes filing'; end if;
 if (select mail_category from public.ca_mail_messages where id='000000000000bb03')<>'Actualités' then raise exception 'News routing'; end if;
 if (select mail_category from public.ca_mail_messages where id='000000000000bb04')<>'Notifications et publicité' then raise exception 'Notification separation'; end if;
end $$;
set local role service_role;
update public.ca_mail_messages set analysis='{"category":"Actualités","topic":"Sécurité routière","priority":"Courante","actions":["Pour information"],"summary":"Information"}' where id='000000000000bb05';
update public.ca_mail_messages set mail_category='Vie du réseau',mail_topic='Vie associative',filing_source='manual' where id='000000000000bb05';
update public.ca_mail_messages set analysis=analysis||'{"category":"Administratif","topic":"Administratif"}' where id='000000000000bb05';
reset role;
do $$ begin
 if (select mail_category from public.ca_mail_messages where id='000000000000bb05')<>'Vie du réseau' then raise exception 'Manual category overwritten'; end if;
 if (select mail_topic from public.ca_mail_messages where id='000000000000bb05')<>'Vie associative' then raise exception 'Manual topic overwritten'; end if;
 if has_table_privilege('authenticated','public.ca_mail_messages','update') then raise exception 'Direct mail writes permitted'; end if;
end $$;
rollback;
select 'PASS: agendas, minutes, news, notifications and manual corrections preserved' as result;
