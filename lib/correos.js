// Buzones de Gmail conectados (uno por persona). Los tokens se guardan cifrados en la Hoja.
import crypto from 'node:crypto';
import { env, gmailCon } from './google.js';
import { readAll, upsert, removeRow } from './db.js';

const key = () => crypto.createHash('sha256').update('simevi-gmail|' + (env('SESSION_SECRET') || env('GOOGLE_CLIENT_SECRET'))).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function descifrar(b64) {
  const b = Buffer.from(String(b64), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

export async function buzones(req) {
  const { conexiones = [] } = await readAll(req, ['conexiones']);
  return conexiones.filter(c => c.tipo === 'gmail' && c.token).map(c => ({ cuenta: c.cuenta, por: c.por, fecha: c.fecha, token: c.token }));
}
export async function guardarBuzon(req, cuenta, refreshToken, por) {
  await upsert(req, 'conexiones', { id: 'gmail:' + cuenta, tipo: 'gmail', cuenta, token: cifrar(refreshToken), por, fecha: new Date().toISOString() });
}
export async function quitarBuzon(req, cuenta) {
  return removeRow(req, 'conexiones', 'gmail:' + cuenta);
}
export function clienteDe(req, b) {
  return gmailCon(req, descifrar(b.token));
}
