import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Globe2,RefreshCw,Newspaper} from 'lucide-react';
import {supabase,type Publication,type RecordItem} from './lib/backend';

type Source={label:string;url:string;date?:string};
type Article={id:string;title:string;body:string;topic:string;progress:string;next_step:string;source_refs:Source[];published_at:string;news_scope:string;news_type:string;importance:string;impact:string;event_date:string|null;verified_at:string|null};
type Watch={last_checked_at:string|null;last_success_at:string|null;status:string;message:string};
const scopes=['Tous','Europe','France','Région Sud','Alpes-Maritimes'];
const types=['Tous','Décision officielle','Projet en débat','Position associative','Événement','Étude et chiffres','Information'];
const stamp=(s:string)=>new Date(s).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
const day=(s:string)=>new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'});
function safeUrl(s:string){try{const u=new URL(s);return u.protocol==='https:'||u.protocol==='http:'?u.href:undefined;}catch{return undefined;}}

export default function MotoNews({onPrepareShare,onPrepareRecord}:{onPrepareShare:(p:Publication)=>void;onPrepareRecord:(r:RecordItem)=>void}){
 const [items,setItems]=useState<Article[]>([]),[watch,setWatch]=useState<Watch|null>(null),[scope,setScope]=useState('Tous'),[type,setType]=useState('Tous'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 const version=useRef(0);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(0)},300);return()=>clearTimeout(timer)},[search]);
 async function load(quiet=false){const current=++version.current;if(!quiet)setBusy(true);try{
  let q=supabase!.from('ca_news_items').select('id,title,body,topic,progress,next_step,source_refs,published_at,news_scope,news_type,importance,impact,event_date,verified_at').eq('kind','veille').order('published_at',{ascending:false}).order('id');
  if(scope!=='Tous')q=q.eq('news_scope',scope);if(type!=='Tous')q=q.eq('news_type',type);if(query)q=q.ilike('title',`%${query}%`);
  const [articles,state]=await Promise.all([q.range(page*12,page*12+12),supabase!.from('ca_news_watch').select('last_checked_at,last_success_at,status,message').eq('id','primary').maybeSingle()]);
  if(current!==version.current)return;if(articles.error||state.error)throw Error('Le fil n’a pas pu être actualisé. Les informations affichées peuvent dater.');
  setItems(articles.data.slice(0,12));setMore(articles.data.length>12);setWatch(state.data);setError('');setNow(Date.now());
 }catch(e){if(current===version.current)setError((e as Error).message);}finally{if(current===version.current)setBusy(false);}}
 useEffect(()=>{void load();const timer=setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible')void load(true)},60000);const focus=()=>{if(document.visibilityState==='visible')void load(true)};document.addEventListener('visibilitychange',focus);return()=>{version.current++;clearInterval(timer);document.removeEventListener('visibilitychange',focus)}},[scope,type,query,page]);
 const stale=!watch?.last_success_at||now-new Date(watch.last_success_at).getTime()>3*3600000;
 const firstPage=page===0&&scope==='Tous'&&type==='Tous'&&!query;
 const lead=firstPage?(items.find(n=>n.importance==='À la une')||items[0]):undefined;
 const rest=lead?items.filter(n=>n.id!==lead.id):items;
 function article(n:Article,featured=false){return <article key={n.id} className={'moto-story '+(featured?'moto-featured':'')}>
  <div className="moto-tags"><span className="moto-scope">{n.news_scope}</span><span>{n.news_type}</span>{n.importance!=='À suivre'&&<strong>{n.importance}</strong>}</div>
  <p className="moto-topic">{n.topic}</p><h2>{n.title}</h2>
  <p className="moto-excerpt">{n.body}</p>
  {n.impact&&<div className="moto-impact"><strong>Pour les motards et la FFMC 06</strong><p>{n.impact}</p></div>}
  <div className="moto-date"><span>Ajouté le {stamp(n.published_at)}</span>{n.event_date&&<span>Date du sujet : {day(n.event_date)}</span>}{n.verified_at&&<span>Sources consultées le {stamp(n.verified_at)}</span>}</div>
  <details><summary>Lire le point complet et les sources</summary><p className="publication-body">{n.body}</p>{n.progress&&<><h3>Ce qui a avancé</h3><p className="publication-body">{n.progress}</p></>}{n.next_step&&<><h3>À suivre</h3><p className="publication-body">{n.next_step}</p></>}<ul className="moto-sources">{n.source_refs.map((s,i)=><li key={i}>{safeUrl(s.url)?<a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.label} <ArrowUpRight size={13}/></a>:s.label}{s.date&&<small>Publication source : {day(s.date)}</small>}</li>)}</ul>
  <div className="sharing-actions"><button className="secondary" onClick={()=>onPrepareRecord({kind:'Dossier',title:n.title.slice(0,200),status:'À réfléchir',owner:'',due:'',notes:n.body+'\n\nIntérêt pour le 06 : '+n.impact+'\n\nSources :\n'+n.source_refs.map(s=>s.label+' : '+s.url).join('\n'),next:n.next_step})}>Préparer un dossier</button><button className="secondary" onClick={()=>onPrepareShare({title:n.title.slice(0,200),body:n.body+'\n\n'+n.source_refs.map(s=>s.label+' : '+s.url).join('\n'),published:true})}>Relire avant partage au CA</button></div></details>
 </article>}
 return <section className="moto-news"><div className="moto-masthead"><div><p className="eyebrow"><Newspaper size={15}/> LE FIL MOTO & POLITIQUE</p><h2>Comprendre ce qui change.<br/>Savoir quoi défendre.</h2><p>Europe, France et Région Sud : décisions publiques, débats, routes et vie du mouvement motard.</p></div><Globe2 className="moto-globe" size={100} strokeWidth={1}/></div>
 <div className={'moto-watch '+(stale||watch?.status==='error'?'moto-watch-warning':'')} role="status"><div><strong>Recherche web programmée toutes les heures</strong><p>{watch?.last_checked_at?'Dernière recherche : '+stamp(watch.last_checked_at)+' (Paris).':'Première recherche en attente.'} {stale?'Actualisation à vérifier. ':''}{watch?.status==='partial'?'Couverture partielle. ':''}{watch?.message}</p><small>Synthèses assistées par IA · Actualisation de l’écran chaque minute · Pas de flux instantané</small></div><button className="secondary" onClick={()=>void load()} disabled={busy}><RefreshCw size={15}/>{busy?'Chargement…':'Actualiser le fil'}</button></div>
 <div className="moto-filters"><div className="filters" aria-label="Zone géographique">{scopes.map(s=><button aria-pressed={scope===s} className={scope===s?'chosen':''} key={s} onClick={()=>{setScope(s);setPage(0)}}>{s}</button>)}</div><div className="news-toolbar"><label>Rechercher<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="CT, voies réservées, carburants…"/></label><label>Nature de l’information<select value={type} onChange={e=>{setType(e.target.value);setPage(0)}}>{types.map(t=><option key={t}>{t}</option>)}</select></label></div></div>
 {error&&<p role="alert" className="overdue">{error}</p>}{busy?<p>Chargement du fil…</p>:<>{lead&&article(lead,true)}<div className="moto-grid">{rest.map(n=>article(n))}</div>{!items.length&&<div className="empty"><Newspaper size={28}/><h3>Aucune actualité dans cette sélection</h3><p>Les nouvelles vérifiées apparaîtront ici. Une période sans nouveauté ne crée pas de faux articles.</p></div>}</>}
 <div className="sharing-actions moto-pagination"><button className="secondary" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>Page {page+1}</span><button className="secondary" disabled={!more||busy} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>
 <aside className="moto-method"><strong>Des sources, des dates, du contexte.</strong><p>Une proposition ou une position associative n’est pas une règle en vigueur. Les synthèses précisent les points restant à vérifier. Le partage au CA reste soumis à ta validation.</p><a href="https://www.inforoutes06.fr/" target="_blank" rel="noreferrer">Conditions de circulation immédiates : consulter Inforoutes 06 <ArrowUpRight size={14}/></a></aside></section>;
}
