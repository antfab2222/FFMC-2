const encoder = new TextEncoder();
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
export function randomState(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function hash(value: string): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function encryptionKey(secret: string, projectUrl: string) {
  if (!secret || !projectUrl) throw new Error('Encryption configuration missing');
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode(projectUrl),info:encoder.encode('ffmc-gmail-refresh-token-v1')}, material, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
// The OAuth client secret stays in Edge Function secrets, never in the database.
// Rotating that secret requires reconnecting Gmail.
export async function encryptToken(token: string, secret: string, projectUrl: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await encryptionKey(secret,projectUrl), encoder.encode(token));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}
export async function decryptToken(value: string, secret: string, projectUrl: string): Promise<string> {
  const [version, iv, encrypted] = value.split('.');
  if (version !== 'v1' || !iv || !encrypted) throw new Error('Invalid ciphertext');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(iv)}, await encryptionKey(secret,projectUrl), fromBase64(encrypted));
  return new TextDecoder().decode(plain);
}
