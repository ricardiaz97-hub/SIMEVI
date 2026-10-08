// Revisa la configuración paso a paso. No muestra secretos.
import { env, redirectUri, workspace, tokenInfo, hint, sheets, gmail } from '../lib/google.js';
import { users, currentUser } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const checks = [];
  const add = (name, ok, detail, warn) => checks.push({ name, ok, detail, warn });
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SIMEVI_USUARIOS', 'SESSION_SECRET', 'GOOGLE_REFRESH_TOKEN', 'SIMEVI_SHEET_ID'])
    add('Variable ' + k, !!env(k), env(k) ? 'definida' : ({ SESSION_SECRET: 'no definida (se usa el client secret; mejor crea una propia)', SIMEVI_SHEET_ID: 'no definida (se busca la hoja por nombre)', GOOGLE_REFRESH_TOKEN: 'falta: entra como administrador → Ajustes → Conectar Google' }[k] || 'FALTA: agrégala en Vercel y pulsa Redeploy'), ['SESSION_SECRET', 'SIMEVI_SHEET_ID'].includes(k));
  if (env('GOOGLE_CLIENT_ID') && !/\.apps\.googleusercontent\.com$/.test(env('GOOGLE_CLIENT_ID'))) add('Formato del Client ID', false, 'Debe terminar en .apps.googleusercontent.com');
  const us = users();
  add('Personas con acceso', us.length > 0, us.map(u => `${u.nombre}${u.admin ? ' (administra)' : ''}`).join(', ') || 'ninguna');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  add('Redirect URI', true, `${redirectUri(req)} debe estar en Google Cloud → Clientes → URIs de redireccionamiento autorizados. Y https://${host} en Orígenes de JavaScript autorizados.`);
  const u = currentUser(req);
  if (!u) add('Sesión', true, 'No has entrado; las pruebas de Google se omiten.', true);
  else if (env('GOOGLE_REFRESH_TOKEN')) {
    try {
      const i = await tokenInfo(req);
      add('Permiso de Google', true, 'cuenta ' + i.email);
      add('Permiso de Gmail', i.scopes.some(s => s.includes('gmail')), i.scopes.some(s => s.includes('gmail')) ? 'lectura' : 'falta: vuelve a conectar y marca la casilla de Gmail');
      const ws = await workspace(req);
      add('Carpeta y Hoja', true, 'hoja ' + ws.sheetId);
      await sheets(req).spreadsheets.get({ spreadsheetId: ws.sheetId, fields: 'properties.title' });
      add('Google Sheets API', true, 'responde');
      await gmail(req).users.getProfile({ userId: 'me' }).then(() => add('Gmail API', true, 'responde')).catch(e => add('Gmail API', false, hint(e)));
    } catch (e) { add('Acceso a Google', false, hint(e)); }
  }
  const ok = checks.every(c => c.ok || c.warn);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!String(req.headers.accept || '').includes('text/html')) return res.json({ ok, checks });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIMEVI · Diagnóstico</title>
<body style="font:15px system-ui;max-width:780px;margin:32px auto;padding:0 16px;background:#0B151C;color:#F3ECE0"><h2>Diagnóstico ${ok ? '✅' : '❌'}</h2>
<table style="border-collapse:collapse;width:100%">${checks.map(c => `<tr><td style="padding:8px;border-bottom:1px solid #2a3a45;vertical-align:top">${c.ok ? '✅' : c.warn ? '⚠️' : '❌'}</td><td style="padding:8px;border-bottom:1px solid #2a3a45"><b>${esc(c.name)}</b><br><span style="color:#B9B2A6">${esc(c.detail)}</span></td></tr>`).join('')}</table>
<p><a style="color:#E8CB94" href="/">Volver a SIMEVI</a></p></body>`);
}
