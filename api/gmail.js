// GET: correos recientes de Gmail (solo lectura). POST: copia los adjuntos de un correo a Drive.
import { Readable } from 'node:stream';
import { gmail, drive, subfolder, hint } from '../lib/google.js';
import { requireUser, readJson } from '../lib/session.js';

const header = (m, n) => m.payload?.headers?.find(h => h.name.toLowerCase() === n)?.value || '';
const decode = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function walk(p, fn) { if (!p) return; fn(p); (p.parts || []).forEach(x => walk(x, fn)); }
function bodyText(m) {
  let plain = '', html = '';
  walk(m.payload, p => {
    if (p.filename) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plain += decode(p.body.data);
    if (p.mimeType === 'text/html' && p.body?.data) html += decode(p.body.data);
  });
  const t = plain || html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return t.replace(/\s+/g, ' ').trim().slice(0, 4000);
}
function attachments(m) {
  const out = [];
  walk(m.payload, p => { if (p.filename && p.body?.attachmentId) out.push({ id: p.partId, name: p.filename, size: p.body.size, mime: p.mimeType }); });
  return out;
}
function parseFrom(v) {
  const m = String(v).match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  return m ? { fromName: m[1].trim(), from: m[2].trim().toLowerCase() } : { fromName: '', from: String(v).trim().toLowerCase() };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = requireUser(req, res); if (!user) return;
  try {
    const g = gmail(req);
    if (req.method === 'GET') {
      const q = String(req.query?.q || 'newer_than:30d -category:promotions -category:social');
      const list = await g.users.messages.list({ userId: 'me', q, maxResults: 30 });
      const ids = (list.data.messages || []).map(m => m.id);
      const msgs = await Promise.all(ids.map(id => g.users.messages.get({ userId: 'me', id, format: 'full' }).then(r => r.data).catch(() => null)));
      return res.json({
        messages: msgs.filter(Boolean).map(m => ({
          id: m.id, threadId: m.threadId, fecha: new Date(+m.internalDate).toISOString(),
          ...parseFrom(header(m, 'from')), subject: header(m, 'subject'), snippet: m.snippet ? m.snippet.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '',
          body: bodyText(m), attachments: attachments(m)
        }))
      });
    }
    if (req.method === 'POST') {
      const { id, attachments: want = [], folder } = await readJson(req);
      const m = (await g.users.messages.get({ userId: 'me', id, format: 'full' })).data;
      const parts = [];
      walk(m.payload, p => { if (p.filename && p.body?.attachmentId && want.includes(p.partId)) parts.push(p); });
      const parent = await subfolder(req, folder);
      const d = drive(req);
      const docs = [];
      for (const p of parts) {
        // El attachmentId cambia entre lecturas; por eso se busca por partId en este mismo mensaje.
        const a = await g.users.messages.attachments.get({ userId: 'me', messageId: id, id: p.body.attachmentId });
        const buf = Buffer.from(a.data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const f = await d.files.create({
          requestBody: { name: p.filename, parents: [parent], description: `Adjunto del correo "${header(m, 'subject')}" (copiado por ${user.nombre})` },
          media: { mimeType: p.mimeType || 'application/octet-stream', body: Readable.from(buf) }, fields: 'id,name,size'
        });
        docs.push({ id: f.data.id, name: f.data.name, size: +f.data.size || buf.length, partId: p.partId });
      }
      return res.json({ docs });
    }
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) { console.error(e); res.status(e.code === 'not_connected' ? 503 : 500).json({ message: hint(e) }); }
}
