// Entrar y salir. Una sola función para no pasar el límite de 12 del plan gratis de Vercel.
//   /api/login  → /api/auth?a=login     /api/logout → /api/auth?a=logout
import login from '../lib/rutas/login.js';
import logout from '../lib/rutas/logout.js';

export default function handler(req, res) {
  const a = req.query?.a || (String(req.url).match(/\/api\/(login|logout)/) || [])[1];
  if (a === 'logout') return logout(req, res);
  return login(req, res);
}
