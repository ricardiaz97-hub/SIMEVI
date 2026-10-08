// Conexiones con Google. Una sola función para no pasar el límite de 12 del plan gratis de Vercel.
//   /api/google/connect · /api/google/callback · /api/google/disconnect
import connect from '../lib/rutas/connect.js';
import callback from '../lib/rutas/callback.js';
import disconnect from '../lib/rutas/disconnect.js';

export default function handler(req, res) {
  const a = req.query?.a || (String(req.url).match(/\/api\/google\/(connect|callback|disconnect)/) || [])[1];
  if (a === 'callback') return callback(req, res);
  if (a === 'disconnect') return disconnect(req, res);
  if (a === 'connect') return connect(req, res);
  res.status(404).json({ message: 'Ruta no encontrada' });
}
