// Lo que ve el cliente con su enlace privado. Solo datos marcados como visibles, sin notas internas.
import { readAll } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t = String(req.query?.t || '');
  if (t.length < 10) return res.status(404).json({ message: 'Enlace no válido.' });
  try {
    const db = await readAll(req, ['clientes', 'polizas', 'tramites', 'pagos']);
    const c = db.clientes.find(x => x.portal === t);
    if (!c) return res.status(404).json({ message: 'Este enlace no existe o fue cambiado.' });
    const pol = id => db.polizas.find(p => p.id === id)?.numero || '';
    res.json({
      cliente: { nombre: c.nombre },
      tramites: db.tramites.filter(x => x.clienteId === c.id && x.visibleCliente).map(x => ({
        tipo: x.tipo, asunto: x.asunto, numeroReclamo: x.numeroReclamo, aseguradora: x.aseguradora, etapa: x.etapa, notaCliente: x.notaCliente, actualizado: x.actualizado, poliza: pol(x.polizaId)
      })),
      pagos: db.pagos.filter(p => p.clienteId === c.id && (p.estado === 'disponible' || p.estado === 'oficina')).map(p => ({ forma: p.forma, monto: p.monto, aseguradora: p.aseguradora, estado: p.estado }))
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'No se pudo cargar. Intenta más tarde.' }); }
}
