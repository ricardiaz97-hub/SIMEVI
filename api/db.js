// Leer todo (GET) o guardar / eliminar un registro (POST). El autor lo pone el servidor, no el navegador.
import { requireUser, readJson } from '../lib/session.js';
import { readAll, upsert, removeRow, getRow, log } from '../lib/db.js';
import { TABLES } from '../lib/schema.js';
import { hint } from '../lib/google.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = requireUser(req, res); if (!user) return;
  try {
    if (req.method === 'GET') {
      const all = await readAll(req, Object.keys(TABLES).filter(t => t !== 'conexiones'));
      all.bitacora = (all.bitacora || []).slice(-1500);
      return res.json(all);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const { op, table, row, id, log: lg = {} } = await readJson(req);
    if (!TABLES[table] || table === 'bitacora' || table === 'conexiones') return res.status(400).json({ message: 'Tabla no válida' });
    if (op === 'upsert') {
      if (!row?.id) return res.status(400).json({ message: 'Falta el id' });
      const prev = await getRow(req, table, row.id);
      const now = new Date().toISOString();
      const clean = { ...row, creado: prev?.creado || now, creadoPor: prev?.creadoPor || user.email, actualizado: now, actualizadoPor: user.email };
      await upsert(req, table, clean);
      const e = await log(req, user.email, String(lg.accion || (prev ? 'actualizó' : 'creó')).slice(0, 20), table, row.id, lg.resumen);
      return res.json({ row: clean, log: e });
    }
    if (op === 'delete') {
      const ok = await removeRow(req, table, id);
      const e = ok ? await log(req, user.email, 'eliminó', table, id, lg.resumen) : null;
      return res.json({ ok, log: e });
    }
    res.status(400).json({ message: 'Operación no válida' });
  } catch (e) { console.error(e); res.status(e.code === 'not_connected' ? 503 : 500).json({ message: hint(e) }); }
}
