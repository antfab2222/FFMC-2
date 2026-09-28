begin;
alter table public.ca_mail_messages
 add column mail_category text not null default 'Correspondance' check(mail_category in ('Actualités','Ordres du jour','Comptes rendus','Newsletters','Vie du réseau','Administratif','Notifications et publicité','Correspondance')),
 add column mail_topic text not null default 'Autre',
 add column filing_source text not null default 'rules' check(filing_source in ('rules','gemini','manual'));
create function public.file_mail() returns trigger language plpgsql security invoker set search_path='' as $$
declare s text:=lower(new.subject); t text:=lower(new.subject||' '||left(new.body,1800)); c text; p text;
begin
 if new.filing_source='manual' then return new; end if;
 c:=case
 when s ~ '(ordre(s)? du jour|\modj\M)' then 'Ordres du jour'
 when s ~ '(compte[ -]?rendu|procès[ -]verbal|proces[ -]verbal|\mcr\M.*(réunion|reunion|bn|ca|assises))' then 'Comptes rendus'
 when new.sender ~* '(instagram|discord|spreadshop|eneba|facebookmail)' or s ~ '(t.a mentionné|t.a envoyé un message|messages? non lu|sur instagram|dernières stories|découvrez .*dans votre fil|rattrapez les moments|espace de stockage|Delivery Status Notification)' then 'Notifications et publicité'
 when s ~ '(rdp-ffmc|actualit|revue de presse|communiqué|communique|manifestation|manif |mobilisation|voies réservées|voies reservees|présidentielle|presidentielle|limitent.*vitesse|accidents mortels|fermeture a8|circulation.*(a8|vuelta)|travaux d.enrobés)' or new.sender ~* 'lettres@information.dila.gouv.fr' then 'Actualités'
 when s ~ '(newsletter|lettre d.information)' then 'Newsletters'
 when s ~ '(factur|cotisation|adhésion|adhesion|utilité publique|intérêt général|commissaire aux comptes|plateformes agr)' then 'Administratif'
 when new.sender ~* '(listes.ffmc.asso.fr|ffmc.fr|ffmc.asso.fr)' or s ~ '(rmc|calmos|cdr|jti|action solidaire|balade)' then 'Vie du réseau'
 else 'Correspondance' end;
 p:=case
 when c in ('Ordres du jour','Comptes rendus') then 'Réunions et CA'
 when s ~ '(rdp-ffmc|revue de presse)' then 'Actualités générales'
 when s ~ '(contrôle technique|controle technique|\mct\M|ct2rm)' then 'CT moto'
 when s ~ '(factur|cotisation|adhésion|adhesion|utilité publique|commissaire aux comptes|plateformes agr)' then 'Administratif'
 when s ~ '(jti|formation|cours de communication|webinaire)' then 'Formations et JTI'
 when s ~ '(rmc|relais motards|calmos)' then 'Relais Motards Calmos'
 when s ~ '(solidaire|noël|noel|pep 06|lenval)' then 'Solidarité'
 when s ~ '(présidentielle|presidentielle|plaidoyer)' then 'Politique et réglementation'
 when s ~ '(circulation|fermeture a8|travaux d.enrobés|voies réservées|voies reservees)' then 'Circulation et infrastructures'
 when s ~ '(sécurité routière|securite routiere|accidents|limitent.*vitesse)' then 'Sécurité routière'
 when s ~ '(manifestation|manif |mobilisation)' then 'Manifestations'
 when s ~ '(balade|sorties moto|loisirs)' then 'Balades'
 when s ~ '(réunion|reunion|cdr|assises)' then 'Réunions et CA'
 when c='Notifications et publicité' then 'Services et notifications'
 when c='Vie du réseau' then 'Vie associative'
 when c='Actualités' then 'Actualités générales'
 when t ~ '(partenaire|partenariat)' then 'Partenaires'
 else coalesce(new.analysis->>'topic','Autre') end;
 if new.analysis->>'category' in ('Actualités','Ordres du jour','Comptes rendus','Newsletters','Vie du réseau','Administratif','Notifications et publicité','Correspondance') then
  c:=new.analysis->>'category'; p:=coalesce(new.analysis->>'topic',p);new.filing_source:='gemini';
 else new.filing_source:='rules'; end if;
 new.mail_category:=c;new.mail_topic:=p;
 return new;
end $$;
revoke all on function public.file_mail() from public,anon,authenticated;
create trigger ca_mail_filing before insert or update of analysis,subject,body,filing_source on public.ca_mail_messages for each row execute function public.file_mail();
update public.ca_mail_messages set filing_source='rules';
create index ca_mail_category_date_idx on public.ca_mail_messages(mail_category,sent_at desc);
create index ca_mail_topic_date_idx on public.ca_mail_messages(mail_topic,sent_at desc);
-- Previously reviewed history still receives an individual AI analysis, within the existing daily limit.
create or replace function public.dispatch_mail_job(job_action text) returns bigint
language plpgsql security invoker set search_path='' as $$
declare job_token text; request_id bigint;
begin
 if job_action not in ('sync','analyze') then raise exception 'Invalid mail job'; end if;
 delete from public.ca_mail_job_tokens where expires_at<now();
 if not exists(select 1 from public.ca_gmail_connections c join public.ca_members m on m.user_id=c.connected_by and m.role='coordinateur' where c.id='primary' and c.auto_enabled and c.lock_until<now()) then return null; end if;
 if job_action='analyze' and (
  not exists(select 1 from public.ca_mail_messages where analysis is null)
  or coalesce((select attempts from public.ca_mail_ai_usage where day=(now() at time zone 'UTC')::date),0)>=20
  or exists(select 1 from public.ca_gmail_connections where id='primary' and ai_pause_until>now())
 ) then return null; end if;
 job_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.ca_mail_job_tokens values(encode(extensions.digest(job_token,'sha256'),'hex'),job_action,now()+interval '5 minutes');
 select net.http_post(url:='https://hojiveehwtazeqiymnwg.supabase.co/functions/v1/mail-assistant',headers:=jsonb_build_object('Content-Type','application/json','x-mail-job-token',job_token),body:=jsonb_build_object('action',job_action),timeout_milliseconds:=140000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_mail_job(text) from public,anon,authenticated,service_role;
commit;
