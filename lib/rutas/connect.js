// Inicia un permiso de Google.
//   ?para=datos  la cuenta donde se guardan la Hoja y los PDFs (solo quien administra)
//   ?para=gmail  el Gmail de trabajo de quien está conectado, para la Bandeja
import { oauth, signState, SCOPES_DATOS, SCOPES_GMAIL, missingEnv } from '../google.js';
import { requireUser } from '../session.js';

export default function handler(req, res) {
  const miss = missingEnv(); if (miss.length) return res.status(500).end('Faltan variables en Vercel: ' + miss.join(', '));
  const para = req.query?.para === 'gmail' ? 'gmail' : 'datos';
  const user = requireUser(req, res, { admin: para === 'datos' }); if (!user) return;
  const url = oauth(req).generateAuthUrl({
    access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: false,
    scope: para === 'gmail' ? SCOPES_GMAIL : SCOPES_DATOS, state: signState(para),
    ...(para === 'gmail' ? { login_hint: user.email } : {})
  });
  res.redirect(302, url);
}
