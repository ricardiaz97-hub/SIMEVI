// Quita un Gmail de la Bandeja. Cada quien puede quitar el suyo; quien administra, cualquiera.
import { requireUser, readJson } from '../../lib/session.js';
import { quitarBuzon, buzones } from '../../lib/correos.js';
import { hint } from '../../lib/google.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const user = requireUser(req, res); if (!user) return;
  try {
    const { cuenta } = await readJson(req);
    const b = (await buzones(req)).find(x => x.cuenta === cuenta);
    if (!b) return res.json({ ok: true });
    if (!user.admin && b.por !== user.email && b.cuenta !== user.email) return res.status(403).json({ message: 'Solo quien lo conectó puede quitarlo.' });
    await quitarBuzon(req, cuenta);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: hint(e) }); }
}
