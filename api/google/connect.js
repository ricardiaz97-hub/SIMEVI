// Inicia el permiso de Google (Drive, Hojas y Gmail). Solo la persona administradora.
import { oauth, signState, SCOPES, missingEnv } from '../../lib/google.js';
import { requireUser } from '../../lib/session.js';

export default function handler(req, res) {
  const miss = missingEnv(); if (miss.length) return res.status(500).end('Faltan variables en Vercel: ' + miss.join(', '));
  const user = requireUser(req, res, { admin: true }); if (!user) return;
  const url = oauth(req).generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: true, scope: SCOPES, state: signState(), login_hint: user.email });
  res.redirect(302, url);
}
