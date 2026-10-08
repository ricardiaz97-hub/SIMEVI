// Sube un archivo a Drive: SIMEVI / Documentos / <cliente> / archivo.pdf
import { Readable } from 'node:stream';
import { drive, subfolder, hint } from '../lib/google.js';
import { requireUser } from '../lib/session.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const user = requireUser(req, res); if (!user) return;
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const dec = h => { try { return decodeURIComponent(String(req.headers[h] || '')); } catch { return String(req.headers[h] || ''); } };
    const name = dec('x-filename') || 'documento.pdf';
    const parent = await subfolder(req, dec('x-folder'));
    const f = await drive(req).files.create({
      requestBody: { name, parents: [parent], description: `Subido por ${user.nombre} desde SIMEVI` },
      media: { mimeType: req.headers['content-type'] || 'application/octet-stream', body: Readable.from(body) },
      fields: 'id,name,mimeType,size'
    });
    res.json({ id: f.data.id, name: f.data.name, mime: f.data.mimeType, size: +f.data.size || body.length });
  } catch (e) { console.error(e); res.status(500).json({ message: hint(e) }); }
}
