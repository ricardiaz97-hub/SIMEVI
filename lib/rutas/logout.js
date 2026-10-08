import { clearSession } from '../session.js';
export default function handler(req, res) { clearSession(res); res.json({ ok: true }); }
