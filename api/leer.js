// Saca el texto de PDFs escaneados. La app busca en ese texto los formularios de reclamo.
//   { fileIds: [...] }                         PDFs ya guardados en Drive
//   { mail: { id, cuenta, partIds: [...] } }   adjuntos de un correo
import { requireUser, readJson } from '../lib/session.js';
import { leerBytes, leerArchivo } from '../lib/ocr.js';
import { buzones, clienteDe } from '../lib/correos.js';
import { hint } from '../lib/google.js';

function walk(p, fn) { if (!p) return; fn(p); (p.parts || []).forEach(x => walk(x, fn)); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const user = requireUser(req, res); if (!user) return;
  try {
    const { fileIds = [], mail } = await readJson(req);
    const tareas = [];
    for (const id of fileIds.slice(0, 6)) tareas.push(leerArchivo(req, id).then(texto => ({ ref: id, texto })).catch(e => ({ ref: id, texto: '', error: hint(e) })));
    if (mail?.id) {
      const b = (await buzones(req)).find(x => x.cuenta === mail.cuenta);
      if (!b) return res.status(400).json({ message: 'Ese Gmail ya no está conectado.' });
      const g = clienteDe(req, b);
      const m = (await g.users.messages.get({ userId: 'me', id: mail.id, format: 'full' })).data;
      const partes = [];
      walk(m.payload, p => { if (p.filename && p.body?.attachmentId && (mail.partIds || []).includes(p.partId)) partes.push(p); });
      for (const p of partes.slice(0, 6)) tareas.push((async () => {
        try {
          const a = await g.users.messages.attachments.get({ userId: 'me', messageId: mail.id, id: p.body.attachmentId });
          const buf = Buffer.from(a.data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
          return { ref: p.partId, name: p.filename, texto: await leerBytes(req, buf, p.mimeType, p.filename) };
        } catch (e) { return { ref: p.partId, name: p.filename, texto: '', error: hint(e) }; }
      })());
    }
    res.json({ textos: await Promise.all(tareas) });
  } catch (e) { console.error(e); res.status(500).json({ message: hint(e) }); }
}
