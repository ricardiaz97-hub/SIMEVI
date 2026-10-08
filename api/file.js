// Abre un documento de Drive a través de la app (así Silvia lo ve aunque el archivo sea de la cuenta de Ricardo).
import { drive } from '../lib/google.js';
import { requireUser } from '../lib/session.js';

export default async function handler(req, res) {
  const user = requireUser(req, res); if (!user) return;
  try {
    const id = String(req.query?.id || ''); if (!id) return res.status(400).end('Falta el id');
    const d = drive(req);
    const meta = await d.files.get({ fileId: id, fields: 'name,mimeType,size' });
    const r = await d.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
    res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.data.name)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    r.data.on('error', () => { try { res.end(); } catch { } });
    r.data.pipe(res);
  } catch (e) { console.error(e); res.status(404).end('Archivo no encontrado'); }
}
