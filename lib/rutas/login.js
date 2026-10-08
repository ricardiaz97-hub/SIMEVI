// Recibe la credencial de "Iniciar sesión con Google" y abre la sesión si el correo está autorizado.
import { google } from 'googleapis';
import { CLIENT_ID } from '../google.js';
import { users, setSession, readJson } from '../session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const { credential } = await readJson(req);
    const ticket = await new google.auth.OAuth2(CLIENT_ID()).verifyIdToken({ idToken: credential, audience: CLIENT_ID() });
    const p = ticket.getPayload();
    const email = String(p.email || '').toLowerCase();
    if (!p.email_verified) return res.status(403).json({ message: 'Ese correo de Google no está verificado.' });
    if (!users().some(u => u.email === email)) return res.status(403).json({ message: `${email} no tiene acceso. Agrégalo en SIMEVI_USUARIOS (Vercel).` });
    setSession(res, email);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(400).json({ message: 'No se pudo verificar la cuenta de Google: ' + e.message }); }
}
