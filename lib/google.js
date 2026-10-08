// Todo lo de Google: OAuth, Drive (carpeta y PDFs), Sheets (base de datos) y Gmail.
import crypto from 'node:crypto';
import { google } from 'googleapis';

// Vercel guarda tal cual lo que se pega: un espacio al final rompe OAuth sin aviso claro.
export const env = k => String(process.env[k] || '').trim();
export const CLIENT_ID = () => env('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = () => env('GOOGLE_CLIENT_SECRET');
export const REFRESH_TOKEN = () => env('GOOGLE_REFRESH_TOKEN');
export const ROOT_FOLDER = () => env('SIMEVI_DRIVE_FOLDER') || 'SIMEVI';
export const SHEET_NAME = 'SIMEVI · Base de datos';

export const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/drive.file',      // solo archivos creados por la app
  'https://www.googleapis.com/auth/gmail.readonly'   // leer correos (no envía ni borra)
];

export function redirectUri(req) {
  const fixed = env('GOOGLE_REDIRECT_URI');
  if (fixed) return fixed;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (!host) return '';
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${host}/api/google/callback`;
}

export function missingEnv() {
  return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SIMEVI_USUARIOS'].filter(k => !env(k));
}

export function oauth(req) {
  return new google.auth.OAuth2(CLIENT_ID(), CLIENT_SECRET(), redirectUri(req));
}

function authed(req) {
  const rt = REFRESH_TOKEN();
  if (!rt) { const e = new Error('Google no está conectado todavía. Ricardo debe pulsar "Conectar Google" y pegar el token en Vercel.'); e.code = 'not_connected'; throw e; }
  const c = oauth(req);
  c.setCredentials({ refresh_token: rt });
  return c;
}
export const drive = req => google.drive({ version: 'v3', auth: authed(req) });
export const sheets = req => google.sheets({ version: 'v4', auth: authed(req) });
export const gmail = req => google.gmail({ version: 'v1', auth: authed(req) });

// El "state" va firmado para no depender de cookies en el regreso de Google.
export function signState() {
  const p = Date.now().toString(36) + '.' + crypto.randomBytes(10).toString('hex');
  return p + '.' + crypto.createHmac('sha256', CLIENT_SECRET()).update(p).digest('hex').slice(0, 32);
}
export function verifyState(s) {
  const [a, b, sig] = String(s || '').split('.');
  if (!sig) return false;
  const exp = crypto.createHmac('sha256', CLIENT_SECRET()).update(a + '.' + b).digest('hex').slice(0, 32);
  if (exp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return false;
  return Date.now() - parseInt(a, 36) < 15 * 60 * 1000;
}

/* ---------- carpeta y hoja de cálculo ---------- */
let WS = null; // se recuerda mientras la función esté "caliente"

async function findOrCreateFolder(d, name, parent) {
  const q = [`name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, "mimeType = 'application/vnd.google-apps.folder'", 'trashed = false', parent ? `'${parent}' in parents` : null].filter(Boolean).join(' and ');
  const r = await d.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
  if (r.data.files?.[0]) return r.data.files[0].id;
  const m = await d.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }, fields: 'id' });
  return m.data.id;
}

export async function workspace(req, { create = true } = {}) {
  if (WS) return WS;
  const d = drive(req);
  const root = await findOrCreateFolder(d, ROOT_FOLDER());
  const docs = await findOrCreateFolder(d, 'Documentos', root);
  let sheetId = env('SIMEVI_SHEET_ID');
  if (!sheetId) {
    const r = await d.files.list({ q: `name = '${SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id)', pageSize: 1 });
    sheetId = r.data.files?.[0]?.id;
  }
  if (!sheetId && create) {
    const { TABLES } = await import('./schema.js');
    const s = sheets(req);
    const made = await s.spreadsheets.create({
      requestBody: {
        properties: { title: SHEET_NAME, locale: 'es_SV', timeZone: 'America/El_Salvador' },
        sheets: Object.values(TABLES).map(t => ({ properties: { title: t.tab, gridProperties: { frozenRowCount: 1 } } }))
      }, fields: 'spreadsheetId'
    });
    sheetId = made.data.spreadsheetId;
    await s.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'RAW', data: Object.values(TABLES).map(t => ({ range: `${t.tab}!A1`, values: [t.cols] })) }
    });
    await d.files.update({ fileId: sheetId, addParents: root, fields: 'id' });
  }
  WS = { root, docs, sheetId };
  return WS;
}

export async function subfolder(req, name) {
  const ws = await workspace(req);
  const clean = String(name || 'General').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 90) || 'General';
  return findOrCreateFolder(drive(req), clean, ws.docs);
}

let INFO = null;
export async function tokenInfo(req) {
  if (INFO && INFO.at > Date.now() - 10 * 60 * 1000) return INFO;
  const c = authed(req);
  const { token } = await c.getAccessToken();
  const i = await c.getTokenInfo(token);
  INFO = { at: Date.now(), email: i.email || '', scopes: i.scopes || [] };
  return INFO;
}

// Traduce los errores típicos de Google a algo accionable.
export function hint(e) {
  const msg = String(e?.response?.data?.error_description || e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || e);
  if (/invalid_grant/i.test(msg)) return msg + ' → El permiso de Google caducó o fue revocado. Si la app de Google Cloud está en "Prueba", caduca a los 7 días: pásala a "Producción" y vuelve a conectar.';
  if (/invalid_client|unauthorized_client/i.test(msg)) return msg + ' → GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no coinciden con el cliente OAuth.';
  if (/redirect_uri_mismatch/i.test(msg)) return msg + ' → Agrega https://TU-DOMINIO/api/google/callback en Google Cloud → Clientes → URIs de redireccionamiento.';
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(msg)) return msg + ' → Habilita esa API en Google Cloud → APIs y servicios → Biblioteca (Drive, Sheets y Gmail).';
  if (/insufficient.*scope|insufficientPermissions/i.test(msg)) return msg + ' → Falta un permiso. Vuelve a conectar Google y acepta todas las casillas.';
  return msg;
}
