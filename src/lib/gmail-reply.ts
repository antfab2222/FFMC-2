export const gmailAccount = 'coordinateur.ffmc06@gmail.com';
export function validRecipient(value:string){
 return value.length<=254 && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(value);
}
export function replyRecipient(sender:string,direction:string){
 if(direction!=='reçu'||/[\r\n]/.test(sender))return '';
 const match=sender.match(/^[^<>]*<([^<>]+)>\s*$/);
 const address=(match?match[1]:sender).trim();
 return validRecipient(address)&&address.toLowerCase()!==gmailAccount?address:'';
}
export function replySubject(subject:string){return /^(re|rép)\s*:/i.test(subject)?subject:`Re: ${subject}`;}
export function gmailComposeUrl(recipient:string,subject:string,body:string){
 if(!validRecipient(recipient.trim())||!body.trim())return null;
 const url=new URL('https://mail.google.com/mail/');
 url.search=new URLSearchParams({authuser:gmailAccount,view:'cm',fs:'1',to:recipient.trim(),su:subject,body}).toString();
 // Keep long replies intact: the UI offers copying into the original conversation.
 return url.href.length<=7000?url.href:null;
}
export function gmailThreadUrl(threadId:string){return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(gmailAccount)}#all/${encodeURIComponent(threadId)}`;}
