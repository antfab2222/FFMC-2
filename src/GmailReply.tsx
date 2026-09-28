import {useState} from 'react';
import {gmailComposeUrl,gmailThreadUrl,replyRecipient,replySubject,validRecipient} from './lib/gmail-reply';
export default function GmailReply({sender,direction,subject,threadId,draft}:{sender:string;direction:string;subject:string;threadId:string;draft:string}){
 const [recipient,setRecipient]=useState(()=>replyRecipient(sender,direction));
 const [title,setTitle]=useState(()=>replySubject(subject));
 const [body,setBody]=useState(draft);
 const [notice,setNotice]=useState('');
 const href=gmailComposeUrl(recipient,title,body);
 async function copy(){try{await navigator.clipboard.writeText(body);setNotice('Texte copié. Ouvrez l’échange, cliquez sur Répondre puis collez le texte.');}catch{setNotice('Copie impossible : sélectionnez et copiez le texte ci-dessus, puis ouvrez l’échange.');}}
 return <details className="gmail-reply"><summary>Brouillon de réponse — ouvrir dans Gmail</summary><div className="gmail-reply-fields">
 <label>Destinataire à vérifier<input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="adresse@exemple.fr" autoComplete="off" /></label>
 <p className="muted">Adresse proposée à partir de l’expéditeur. Pour une liste de diffusion ou une adresse de réponse différente, vérifiez le destinataire dans Gmail.</p>
 <label>Objet<input value={title} onChange={e=>setTitle(e.target.value)} /></label>
 <label>Réponse proposée<textarea rows={9} value={body} onChange={e=>{setBody(e.target.value);setNotice('');}} /></label>
 <div className="sharing-actions">{href?<a className="primary" href={href} target="_blank" rel="noopener noreferrer">Ouvrir la réponse dans Gmail</a>:<button className="primary" disabled>Ouvrir la réponse dans Gmail</button>}<button className="secondary" onClick={copy} disabled={!body.trim()}>Copier la réponse</button><a href={gmailThreadUrl(threadId)} target="_blank" rel="noopener noreferrer">Ouvrir l’échange dans Gmail</a></div>
 {!validRecipient(recipient.trim())?<p className="muted">Renseignez une adresse de destinataire pour ouvrir le message prérempli.</p>:body.trim()&&!href?<p className="muted">Cette réponse est longue : copiez-la puis collez-la dans la réponse à l’échange Gmail.</p>:null}
 <p className="muted">Gmail ouvrira un nouveau message prérempli, à relire et à envoyer vous-même. Pour répondre dans l’échange d’origine, copiez le texte puis ouvrez l’échange. Vos modifications ici ne sont pas enregistrées.</p>
 {notice&&<p role="status">{notice}</p>}</div></details>;
}
