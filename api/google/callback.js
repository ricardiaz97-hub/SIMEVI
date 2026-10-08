// Regreso de Google: crea la carpeta y la Hoja, y muestra el token para pegarlo en Vercel una sola vez.
import { google } from 'googleapis';
import { oauth, verifyState, hint, REFRESH_TOKEN, SHEET_NAME, ROOT_FOLDER } from '../../lib/google.js';
import { requireUser } from '../../lib/session.js';
import { guardarBuzon } from '../../lib/correos.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIMEVI · Google</title>
<body style="font:15px/1.55 system-ui;max-width:700px;margin:40px auto;padding:0 18px;background:#0B151C;color:#F3ECE0">${body}<p><a style="color:#E8CB94" href="/">Volver a SIMEVI</a></p></body>`);
};

export default async function handler(req, res) {
  const { code, state, error } = req.query || {};
  if (error) return page(res, 400, `<h2>Google canceló el permiso</h2><p>${esc(error)}</p>`);
  const para = verifyState(state);
  if (!para) return page(res, 400, '<h2>La solicitud caducó</h2><p>Vuelve a SIMEVI → Ajustes y pulsa conectar otra vez.</p>');
  const user = requireUser(req, res, { admin: para === 'datos' }); if (!user) return;
  try {
    const c = oauth(req);
    const { tokens } = await c.getToken(code);
    if (!tokens.refresh_token) throw new Error('Google no devolvió refresh token. Quita el acceso de SIMEVI en https://myaccount.google.com/permissions y vuelve a conectar.');
    c.setCredentials(tokens);
    if (para === 'gmail') {
      if (!REFRESH_TOKEN()) throw new Error('Primero hay que conectar la cuenta donde se guardan los datos (Ajustes → Conectar cuenta de datos).');
      const info = await c.getTokenInfo(tokens.access_token);
      const cuenta = String(info.email || '').toLowerCase();
      if (!(info.scopes || []).some(x => x.includes('gmail'))) throw new Error('No se marcó la casilla de leer Gmail. Vuelve a conectar y acéptala.');
      await guardarBuzon(req, cuenta, tokens.refresh_token, user.email);
      return res.redirect(302, '/?gmail=ok#/bandeja');
    }
    // Crear o encontrar la carpeta y la Hoja con el permiso nuevo
    process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    const { workspace } = await import('../../lib/google.js');
    const ws = await workspace(req);
    page(res, 200, `<h2>Google conectado</h2>
<p>Se creó (o se encontró) la carpeta <b>${esc(ROOT_FOLDER())}</b> en tu Drive con la hoja <a style="color:#E8CB94" href="https://docs.google.com/spreadsheets/d/${ws.sheetId}/edit" target="_blank">${esc(SHEET_NAME)}</a>.</p>
<h3>Último paso (una sola vez)</h3>
<ol><li>Copia este token:</li></ol>
<textarea readonly onclick="this.select()" style="width:100%;height:90px;background:#13232E;color:#F3ECE0;border:1px solid #C9A063;padding:10px;font:13px monospace">${esc(tokens.refresh_token)}</textarea>
<ol start="2"><li>En Vercel → tu proyecto → Settings → Environment Variables, crea o reemplaza <b>GOOGLE_REFRESH_TOKEN</b> con ese valor.</li>
<li>También crea <b>SIMEVI_SHEET_ID</b> = <code>${esc(ws.sheetId)}</code> (así la app encuentra la hoja más rápido).</li>
<li>Pulsa <b>Redeploy</b>.</li><li>Después, cada persona entra a SIMEVI → Ajustes → <b>Conectar mi Gmail</b> con su correo de trabajo.</li></ol>
<p style="color:#B9B2A6">Este token da acceso solo a los archivos que crea SIMEVI en tu Drive. No lo compartas con nadie más. Si algún día se filtra, quítale el acceso en https://myaccount.google.com/permissions.</p>`);
  } catch (e) { console.error(e); page(res, 500, `<h2>No se pudo conectar Google</h2><p style="background:#3a1d1a;padding:12px">${esc(hint(e))}</p>`); }
}
