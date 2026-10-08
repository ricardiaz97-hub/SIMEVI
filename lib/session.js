// Sesión propia de SIMEVI: se entra con Google y queda una cookie firmada por 30 días.
import crypto from 'node:crypto';
import { env } from './google.js';

const COOKIE = 'simevi_s';
const DAYS = 30;
const secret = () => env('SESSION_SECRET') || env('GOOGLE_CLIENT_SECRET');

const initials = n => String(n).split(/\s+/).filter(w => w && !/^(de|del|la)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// SIMEVI_USUARIOS = "ricardovegaprod@gmail.com:Ricardo Vega, correo.de.silvia@gmail.com:Silvia de Díaz"
// La primera persona de la lista es quien administra la conexión con Google.
export function users() {
  return env('SIMEVI_USUARIOS').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map((s, i) => {
    const [email, ...rest] = s.split(':');
    const nombre = rest.join(':').trim() || email.split('@')[0];
    return { email: email.trim().toLowerCase(), nombre, ini: initials(nombre), admin: i === 0 };
  });
}

const b64 = s => Buffer.from(s).toString('base64url');
const sig = p => crypto.createHmac('sha256', secret()).update(p).digest('base64url');

export function setSession(res, email) {
  const p = b64(JSON.stringify({ e: email, x: Date.now() + DAYS * 864e5 }));
  res.setHeader('Set-Cookie', `${COOKIE}=${p}.${sig(p)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function currentUser(req) {
  const raw = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw || !secret()) return null;
  const [p, s] = raw.slice(COOKIE.length + 1).split('.');
  if (!p || !s) return null;
  const good = sig(p);
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (Date.now() > x) return null;
    return users().find(u => u.email === e) || null; // si se le quita de la lista, pierde acceso
  } catch { return null; }
}

export function requireUser(req, res, { admin = false } = {}) {
  const u = currentUser(req);
  if (!u) { res.status(401).json({ error: 'not_authenticated', message: 'Inicia sesión primero.' }); return null; }
  if (admin && !u.admin) { res.status(403).json({ error: 'not_admin', message: 'Solo ' + users()[0]?.nombre + ' puede hacer esto.' }); return null; }
  return u;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
